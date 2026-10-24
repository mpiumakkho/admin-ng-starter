import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
import { lucideArrowRight, lucideCheck, lucideCopy, lucidePawPrint, lucideSearch, lucideTrash2, lucideTriangleAlert, lucideUserRound, lucideX } from '@ng-icons/lucide';

import { Session } from '../../user-management';
import { UiButton, UiSegmented } from '../../user-management/ui';
import { ClinicUi } from '../clinic-ui';
import { ClinicStore } from '../clinic.store';
import { REASON_MIN, TODAY } from '../data/model';
import {
  ADDRESS_TABS, type Address, type AddressKind, addressSummary, ageFromIso, BREEDS, draftFromOwner, emptyAddresses, draftFromRecord, findDuplicates,
  missingFields, OTHER_TITLE, ownerFullName, type PetRecord, PROVINCES, type RegistrationDraft, ROUTES, savedAddressKind, searchOwners, searchPets,
  type Sex, SPECIES, speciesLabel, TITLES,
} from '../data/registration';
import type { Owner, PetKind } from '../data/types';
import { ClinicI18n, TxPipe } from '../i18n/clinic-i18n';
import { RegistrationForm } from '../registration-form';
import { PET_ICONS } from '../shared/icons';
import { PetIcon } from '../shared/parts';

/**
 * Registering a pet and its owner at the front desk, as SEPH1's registration screen (seph1-fe, screens/Register.tsx):
 *
 *   title         who is on the form; an HN search that pulls a pet on file into it (read-only), and the page's actions
 *   two panels    the pet | its owner (one owner, many pets): an owner on file is picked from a search, else typed
 *   the address   on the owner's panel, current or registered; province and title are picked, not typed
 *   footer        what will be saved and what is missing, where the pet goes, then save, or save and send to the queue
 *
 * The same microchip, or the same Thai ID and pet name, is the same animal: no new record, only the way to the one on
 * file. The same name and kind with the same owner or phone asks first; only an administrator creates past that, with
 * a reason.
 */
@Component({
  selector: 'app-clinic-register',
  imports: [NgIcon, TxPipe, UiButton, UiSegmented, PetIcon],
  template: `
    @let d = draft();
    @let r = form.record();
    <div class="reg-title">
      <div class="reg-id">
        @if (r) {
          <cl-pet-icon [kind]="r.kind" size="lg" />
        } @else {
          <span class="reg-id-ph" aria-hidden="true"><ng-icon [svg]="icons.paw" /></span>
        }
        <div class="reg-id-text">
          <h1>
            {{ r ? r.pet : ('ผู้ป่วยใหม่' | tx) }}
            @if (r) {
              <span class="hn">· {{ r.hn !== '—' ? r.hn : r.code }}</span>
            }
          </h1>
          <div class="secondary">
            {{ r ? identity() : ('ค้นหา HN เพื่อดึงข้อมูลเดิม หรือกรอกด้านล่างเพื่อลงทะเบียนใหม่' | tx) }}
          </div>
        </div>
      </div>

      <div class="reg-lookup" (focusout)="closeLater(hnQuery)">
        <label for="reg-hn">HN</label>
        <input id="reg-hn" class="ui-input" type="search" autocomplete="off" [placeholder]="'HN / ชื่อสัตว์ / เจ้าของ' | tx" [value]="hnQuery()"
          (input)="hnQuery.set($any($event.target).value)" (keydown.enter)="receive()" (keydown.escape)="hnQuery.set('')" />
        @if (hnQuery()) {
          <div class="reg-pop">
            @if (hnQuery().trim().length < 2) {
              <p class="reg-pop-empty">{{ 'พิมพ์อย่างน้อย 2 ตัวอักษร' | tx }}</p>
            } @else {
              <ul [attr.aria-label]="'ผลการค้นหา HN' | tx">
                @for (hit of hits(); track hit.code) {
                  <li>
                    <button type="button" class="reg-hit" (mousedown)="$event.preventDefault()" (click)="load(hit)">
                      <cl-pet-icon [kind]="hit.kind" />
                      <span class="grow">
                        <b>{{ hit.pet }}</b> <span class="tnum muted">{{ hit.hn !== '—' ? hit.hn : hit.code }}</span>
                        <span class="secondary">{{ ownerOf(hit) }}</span>
                      </span>
                      @if (hit.patient) {
                        <span class="chip info">{{ 'ในคิววันนี้' | tx }}</span>
                      }
                    </button>
                  </li>
                }
              </ul>
              @if (!hits().length) {
                <p class="reg-pop-empty">{{ 'ไม่พบ HN นี้ — ลงทะเบียนใหม่ด้านล่าง' | tx }}</p>
              }
            }
          </div>
        }
      </div>

      <div class="reg-actions">
        <button uiButton variant="ghost" size="sm" type="button" [disabled]="!hits().length" (click)="receive()">{{ 'รับแฟ้ม' | tx }}</button>
        @if (r?.patient) {
          <button uiButton variant="ghost" size="sm" type="button" (click)="openPatient()">{{ 'เปิดเวชระเบียน' | tx }}</button>
        }
        <button uiButton variant="ghost" size="sm" type="button" (click)="reset()">{{ 'ล้างฟอร์ม' | tx }}</button>
      </div>
    </div>

    @if (r) {
      <div class="reg-objstat">
        <span class="os good"><span class="dot"></span>{{ 'ดึงข้อมูลเดิมแล้ว · ดูอย่างเดียว' | tx }}</span>
        @if (fullName()) {
          <span class="os">{{ 'เจ้าของ' | tx }} <b>{{ fullName() }}</b></span>
        }
        @if (d.phone) {
          <span class="os tnum">{{ d.phone }}</span>
        }
        @if (r.patient) {
          <span class="os">{{ 'ในคิววันนี้' | tx }} <b>{{ r.patient.reason | tx }}</b></span>
        }
        @if (d.caution) {
          <span class="os warn"><span class="dot"></span>{{ d.caution }}</span>
        }
      </div>
    }

    @if (form.block(); as block) {
      <div class="reg-block" role="alert">
        <ng-icon [svg]="icons.alert" aria-hidden="true" />
        <div class="grow">
          <b class="reg-block-title">{{ 'ข้อมูลซ้ำแน่นอน — สร้างระเบียนใหม่ไม่ได้' | tx }}</b>
          <div>{{ 'ตรงกันที่' | tx }} <b>{{ block.field }}</b> · {{ block.record.hn !== '—' ? block.record.hn : block.record.code }} · {{ block.record.pet }} · {{ 'เจ้าของ' | tx }} {{ block.owner }}</div>
        </div>
        <button uiButton size="sm" type="button" (click)="load(block.record)"><ng-icon [svg]="icons.next" aria-hidden="true" />{{ 'เปิดระเบียนเดิม' | tx }}</button>
        <button uiButton variant="ghost" size="sm" iconOnly type="button" [attr.aria-label]="'ปิด' | tx" (click)="form.block.set(null)"><ng-icon [svg]="icons.close" aria-hidden="true" /></button>
      </div>
    }

    <fieldset class="plain reg-body" [disabled]="!!r">
      <legend class="visually-hidden">{{ 'ลงทะเบียนผู้ป่วย' | tx }}</legend>

      <!-- The pet -->
      <section class="reg-panel" aria-labelledby="reg-pet-title">
        <div class="reg-panel-head">
          <ng-icon [svg]="icons.paw" aria-hidden="true" />
          <h2 id="reg-pet-title">{{ 'สัตว์ป่วย' | tx }}</h2>
          <span class="hint">{{ 'ชนิด · สายพันธุ์ · ไมโครชิป' | tx }}</span>
        </div>
        <div class="rf pet-grid">
          <label class="rf-lbl" for="reg-pet">{{ 'ชื่อสัตว์' | tx }}<span class="rq"> *</span></label>
          <div class="rf-ctl"><input id="reg-pet" class="ui-input" [value]="d.pet" (input)="set('pet', $any($event.target).value)" placeholder="ลัคกี้" aria-required="true" /></div>
          <label class="rf-lbl" for="reg-chip">{{ 'ไมโครชิป' | tx }}</label>
          <div class="rf-ctl"><input id="reg-chip" class="ui-input tnum" inputmode="numeric" [value]="d.microchip" (input)="set('microchip', $any($event.target).value)" placeholder="900-xxx…" /></div>

          <span class="rf-lbl" id="reg-species">{{ 'ชนิดสัตว์' | tx }}<span class="rq"> *</span></span>
          <div class="rf-ctl wide">
            <div class="sp-pick" role="group" aria-labelledby="reg-species">
              @for (s of species; track s.value) {
                <button type="button" [class]="'sp-btn sp-' + s.value" [class.on]="d.kind === s.value" [attr.aria-pressed]="d.kind === s.value" (click)="pickSpecies(s.value)">
                  <ng-icon [svg]="speciesIcons[s.value]" aria-hidden="true" />{{ s.label | tx }}
                </button>
              }
            </div>
          </div>

          <label class="rf-lbl" for="reg-breed">{{ 'สายพันธุ์' | tx }}</label>
          <div class="rf-ctl">
            <input id="reg-breed" class="ui-input" list="reg-breeds" autocomplete="off" [placeholder]="'พิมพ์เพื่อค้นสายพันธุ์' | tx" [value]="breedText()"
              (input)="typeBreed($any($event.target).value)" [attr.aria-describedby]="breedUnmatched() ? 'reg-breed-note' : null" />
            <datalist id="reg-breeds">
              @for (b of breeds(); track b) {
                <option [value]="b">{{ b | tx }}</option>
              }
            </datalist>
            @if (breedUnmatched()) {
              <p class="vmsg warn" id="reg-breed-note"><ng-icon [svg]="icons.alert" aria-hidden="true" />{{ 'เลือกจากรายการ ไม่อย่างนั้นจะไม่บันทึกสายพันธุ์' | tx }}</p>
            }
          </div>
          <label class="rf-lbl" for="reg-color">{{ 'สี' | tx }}</label>
          <div class="rf-ctl"><input id="reg-color" class="ui-input" [value]="d.color" (input)="set('color', $any($event.target).value)" [placeholder]="'น้ำตาล-ขาว' | tx" /></div>

          <span class="rf-lbl">{{ 'เพศ' | tx }}</span>
          <div class="rf-ctl wide"><ui-segmented size="sm" [options]="sexes()" [value]="d.sex" (valueChange)="set('sex', $event ?? 'u')" [ariaLabel]="'เพศ' | tx" /></div>
          <span class="rf-lbl">{{ 'ทำหมัน' | tx }}</span>
          <div class="rf-ctl wide"><ui-segmented size="sm" [options]="neuters()" [value]="d.neutered" (valueChange)="set('neutered', !!$event)" [ariaLabel]="'ทำหมัน' | tx" /></div>

          <label class="rf-lbl" for="reg-dob">{{ 'วันเกิด' | tx }}</label>
          <div class="rf-ctl wide inline">
            <input id="reg-dob" class="ui-input reg-date" type="date" [max]="today" [value]="d.dob" (change)="set('dob', $any($event.target).value)" />
            <label class="reg-known"><input type="checkbox" [checked]="d.dobKnown" (change)="set('dobKnown', $any($event.target).checked)" />{{ 'ทราบวันเกิดแน่นอน' | tx }}</label>
            @if (age(); as a) {
              <span class="tnum muted">{{ d.dobKnown ? '' : ('ประมาณ' | tx) + ' ' }}{{ '{y} ปี {m} เดือน {d} วัน' | tx: { y: a.y, m: a.m, d: a.d } }}</span>
            }
          </div>

          <label class="rf-lbl top" for="reg-caution">{{ 'ข้อควรระวัง' | tx }}</label>
          <div class="rf-ctl wide">
            <textarea id="reg-caution" class="ui-input" rows="3" maxlength="500" [value]="d.caution" (input)="set('caution', $any($event.target).value)"
              [placeholder]="'นิสัย ข้อควรระวังในการจับบังคับ เช่น กัด ต้องใส่ปลอกปาก' | tx"></textarea>
          </div>
        </div>
      </section>

      <!-- The owner -->
      <section class="reg-panel" aria-labelledby="reg-owner-title">
        <div class="reg-panel-head">
          <ng-icon [svg]="icons.owner" aria-hidden="true" />
          <h2 id="reg-owner-title">{{ 'เจ้าของ' | tx }}</h2>
          <span class="hint">{{ 'เจ้าของ 1 คน มีสัตว์ได้หลายตัว' | tx }}</span>
        </div>

        <div class="reg-owner-find" (focusout)="closeLater(ownerQuery)">
          @if (d.ownerKey && !r) {
            <div class="reg-owner-bar on">
              <ng-icon [svg]="icons.check" aria-hidden="true" />
              <span class="grow">{{ 'ดึงข้อมูลแล้ว' | tx }} · {{ fullName() }}</span>
              @if (clearArm()) {
                <button uiButton variant="danger" size="sm" type="button" (click)="clearOwner()"><ng-icon [svg]="icons.trash" aria-hidden="true" />{{ 'ล้าง' | tx }}</button>
                <button uiButton variant="ghost" size="sm" iconOnly type="button" [attr.aria-label]="'ยกเลิก' | tx" (click)="clearArm.set(false)"><ng-icon [svg]="icons.close" aria-hidden="true" /></button>
              } @else {
                <button uiButton variant="ghost" size="sm" type="button" (click)="clearArm.set(true)"><ng-icon [svg]="icons.close" aria-hidden="true" />{{ 'ล้าง / เจ้าของใหม่' | tx }}</button>
              }
            </div>
          } @else {
            <div class="reg-owner-bar">
              <ng-icon [svg]="icons.search" aria-hidden="true" />
              <input class="grow" type="search" autocomplete="off" [attr.aria-label]="'ค้นหาเจ้าของ' | tx" [placeholder]="'ค้นเจ้าของ: ชื่อ · เบอร์โทร · เลขบัตร · ชื่อสัตว์' | tx"
                [value]="ownerQuery()" (input)="ownerQuery.set($any($event.target).value)" (keydown.escape)="ownerQuery.set('')" />
              @if (ownerQuery()) {
                <span class="muted tnum">{{ '{n} ราย' | tx: { n: owners().length } }}</span>
              }
            </div>
            @if (ownerQuery()) {
              <div class="reg-pop">
                <ul [attr.aria-label]="'เจ้าของที่พบ' | tx">
                  @for (o of owners(); track o[0]) {
                    <li>
                      <button type="button" class="reg-hit" (mousedown)="$event.preventDefault()" (click)="pickOwner(o[0], o[1])">
                        <span class="reg-initial" aria-hidden="true">{{ o[1].name.slice(0, 2) }}</span>
                        <span class="grow">
                          <b>{{ o[1].name }}</b>
                          @if (o[1].pdpa.startsWith('ยินยอม')) {
                            <span class="chip ok">PDPA</span>
                          }
                          <span class="secondary tnum">{{ o[1].phone }} · {{ '{n} ตัว' | tx: { n: o[1].pets.length } }}</span>
                        </span>
                      </button>
                    </li>
                  }
                </ul>
                @if (!owners().length) {
                  <p class="reg-pop-empty">{{ 'ไม่พบ — กรอกฟอร์มด้านล่างเพื่อเพิ่มเจ้าของใหม่' | tx }}</p>
                }
              </div>
            }
          }
        </div>

        <div class="rf owner-grid">
          <label class="rf-lbl" for="reg-first">{{ 'ชื่อ-นามสกุล' | tx }}<span class="rq"> *</span></label>
          <div class="rf-ctl wide reg-name" [class.other]="titleChoice() === otherTitle">
            <select id="reg-honorific" class="ui-input" [attr.aria-label]="'คำนำหน้า' | tx" (change)="pickTitle($any($event.target).value)">
              <option value="" [selected]="!titleChoice()">{{ 'คำนำหน้า' | tx }}</option>
              @for (t of titles; track t) {
                <option [value]="t" [selected]="titleChoice() === t">{{ t | tx }}</option>
              }
              <option [value]="otherTitle" [selected]="titleChoice() === otherTitle">{{ otherTitle | tx }}</option>
            </select>
            @if (titleChoice() === otherTitle) {
              <input id="reg-honorific-other" class="ui-input" [attr.aria-label]="'คำนำหน้าอื่น' | tx" [placeholder]="'เช่น ดร.' | tx" [value]="d.title"
                (input)="set('title', $any($event.target).value)" />
            }
            <input id="reg-first" class="ui-input" [placeholder]="'ชื่อ' | tx" [value]="d.first" (input)="set('first', $any($event.target).value)" aria-required="true" />
            <input id="reg-last" class="ui-input" [attr.aria-label]="'นามสกุล' | tx" [placeholder]="'นามสกุล' | tx" [value]="d.last" (input)="set('last', $any($event.target).value)" />
          </div>

          <label class="rf-lbl" for="reg-phone">{{ 'เบอร์โทร' | tx }}<span class="rq"> *</span></label>
          <div class="rf-ctl"><input id="reg-phone" class="ui-input tnum" type="tel" placeholder="08x-…" [value]="d.phone" (input)="set('phone', $any($event.target).value)" aria-required="true" /></div>
          <label class="rf-lbl" for="reg-mobile">{{ 'มือถือ' | tx }}</label>
          <div class="rf-ctl"><input id="reg-mobile" class="ui-input tnum" type="tel" placeholder="—" [value]="d.mobile" (input)="set('mobile', $any($event.target).value)" /></div>

          <label class="rf-lbl" for="reg-email">{{ 'อีเมล' | tx }}</label>
          <div class="rf-ctl"><input id="reg-email" class="ui-input" type="email" placeholder="name@email.com" [value]="d.email" (input)="set('email', $any($event.target).value)" /></div>
          <label class="rf-lbl top" for="reg-id">{{ 'เลขบัตรประชาชน' | tx }}</label>
          <div class="rf-ctl">
            <input id="reg-id" class="ui-input tnum" inputmode="numeric" placeholder="x-xxxx-xxxxx-xx-x" [class.vs-warn]="idWarn()" [value]="d.thaiId"
              (input)="set('thaiId', $any($event.target).value)" [attr.aria-describedby]="idWarn() ? 'reg-id-note' : null" />
            @if (idWarn()) {
              <p class="vmsg warn" id="reg-id-note"><ng-icon [svg]="icons.alert" aria-hidden="true" />{{ 'แนะนำให้กรอก สำหรับออกใบกำกับภาษี' | tx }}</p>
            }
          </div>

          <span class="rf-lbl" id="reg-address">{{ 'ที่อยู่' | tx }}</span>
          <div class="rf-ctl wide reg-addr-head">
            <ui-segmented size="sm" [options]="addressTabs()" [value]="addressKind()" (valueChange)="addressKind.set($event ?? 'current')" [ariaLabel]="'ที่อยู่' | tx" />
            @if (addressKind() === 'house') {
              <button uiButton variant="ghost" size="sm" type="button" (click)="form.copyCurrent('house')"><ng-icon [svg]="icons.copy" aria-hidden="true" />{{ 'เหมือนที่อยู่ปัจจุบัน' | tx }}</button>
            }
            <span class="reg-addr-note" [class.warn]="addressIncomplete()">
              {{ onFileAddress() ? ('ที่อยู่ในระบบ: {a}' | tx: { a: onFileAddress() }) : (addressNote() | tx) }}
            </span>
          </div>

          <label class="rf-lbl" for="addr-no">{{ 'เลขที่' | tx }}</label>
          <div class="rf-ctl addr-no">
            <input id="addr-no" class="ui-input" [placeholder]="'เลขที่' | tx" [value]="addr('no')" (input)="writeAddr('no', $event)" />
            <input class="ui-input" [attr.aria-label]="'หมู่' | tx" [placeholder]="'หมู่' | tx" [value]="addr('moo')" (input)="writeAddr('moo', $event)" />
            <input class="ui-input" [attr.aria-label]="'ซอย' | tx" [placeholder]="'ซอย' | tx" [value]="addr('soi')" (input)="writeAddr('soi', $event)" />
          </div>
          <label class="rf-lbl" for="addr-road">{{ 'ถนน' | tx }}</label>
          <div class="rf-ctl"><input id="addr-road" class="ui-input" [value]="addr('road')" (input)="writeAddr('road', $event)" /></div>

          <label class="rf-lbl" for="addr-place">{{ 'อาคาร / หมู่บ้าน' | tx }}</label>
          <div class="rf-ctl"><input id="addr-place" class="ui-input" [placeholder]="'บ้าน คอนโด อาคาร' | tx" [value]="addr('place')" (input)="writeAddr('place', $event)" /></div>
          <label class="rf-lbl" for="addr-landmark">{{ 'จุดสังเกต' | tx }}</label>
          <div class="rf-ctl"><input id="addr-landmark" class="ui-input" [placeholder]="'ใกล้…' | tx" [value]="addr('landmark')" (input)="writeAddr('landmark', $event)" /></div>

          <label class="rf-lbl" for="addr-tambon">{{ 'ตำบล / แขวง' | tx }}</label>
          <div class="rf-ctl"><input id="addr-tambon" class="ui-input" [value]="addr('tambon')" (input)="writeAddr('tambon', $event)" /></div>
          <label class="rf-lbl" for="addr-amphoe">{{ 'อำเภอ / เขต' | tx }}</label>
          <div class="rf-ctl"><input id="addr-amphoe" class="ui-input" [value]="addr('amphoe')" (input)="writeAddr('amphoe', $event)" /></div>

          <label class="rf-lbl" for="addr-province">{{ 'จังหวัด' | tx }}</label>
          <div class="rf-ctl">
            <select id="addr-province" class="ui-input" (change)="writeAddr('province', $event)">
              <option value="" [selected]="!addr('province')">{{ 'เลือกจังหวัด' | tx }}</option>
              @for (p of provinces; track p[0]) {
                <option [value]="p[0]" [selected]="addr('province') === p[0]">{{ p[0] | tx }}</option>
              }
            </select>
          </div>
          <label class="rf-lbl" for="addr-zip">{{ 'รหัสไปรษณีย์' | tx }}</label>
          <div class="rf-ctl"><input id="addr-zip" class="ui-input tnum" inputmode="numeric" maxlength="5" [value]="addr('zip')" (input)="writeAddr('zip', $event)" /></div>

          <label class="reg-consent rf-all">
            <input type="checkbox" [checked]="d.pdpa" (change)="set('pdpa', $any($event.target).checked)" />
            {{ 'ยินยอมให้ใช้ข้อมูลเพื่อการรักษา (จำเป็น)' | tx }}
          </label>
        </div>
      </section>
    </fieldset>

    <div class="reg-foot">
      <div class="reg-summary">
        <span class="reg-summary-text">
          {{ 'สัตว์' | tx }} <b>{{ (d.pet || '—') }} · {{ speciesText() | tx }}</b> · {{ 'เจ้าของ' | tx }} <b>{{ fullName() || '—' }}</b>
          @if (d.phone) {
            · <span class="tnum">{{ d.phone }}</span>
          }
        </span>
        @if (r) {
          <span class="reg-state ok"><ng-icon [svg]="icons.check" aria-hidden="true" />{{ (r.patient ? 'อยู่ในคิววันนี้แล้ว' : 'ลงทะเบียนไว้แล้ว') | tx }}</span>
        } @else if (ready()) {
          <span class="reg-state ok"><ng-icon [svg]="icons.check" aria-hidden="true" />{{ 'พร้อมบันทึก' | tx }}</span>
        } @else {
          <span class="reg-state warn"><ng-icon [svg]="icons.alert" aria-hidden="true" />{{ 'ต้องกรอก:' | tx }} {{ missingText() }}</span>
        }
      </div>
      <label class="reg-route-label" for="reg-route">{{ 'ส่งต่อ' | tx }}</label>
      <select id="reg-route" class="ui-input reg-route" [value]="form.route()" (change)="form.route.set($any($event.target).value)">
        @for (route of routes; track route) {
          <option [value]="route" [selected]="route === form.route()">{{ route | tx }}</option>
        }
      </select>
      <button uiButton variant="secondary" type="button" [disabled]="!!r || !ready()" (click)="save(false)">{{ 'ลงทะเบียน' | tx }}</button>
      <button uiButton type="button" [disabled]="!canQueue()" (click)="save(true)">
        <ng-icon [svg]="icons.next" aria-hidden="true" />{{ 'ส่งเข้าคิว' | tx }}
      </button>
    </div>
  `,
  host: { class: 'workspace reg-page' },
})
export class RegisterComponent {
  protected readonly store = inject(ClinicStore);
  protected readonly ui = inject(ClinicUi);
  protected readonly form = inject(RegistrationForm);
  private readonly i18n = inject(ClinicI18n);
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  protected readonly icons = {
    paw: lucidePawPrint, owner: lucideUserRound, search: lucideSearch, check: lucideCheck, close: lucideX, trash: lucideTrash2,
    alert: lucideTriangleAlert, next: lucideArrowRight, copy: lucideCopy,
  };
  protected readonly speciesIcons = PET_ICONS;
  protected readonly species = SPECIES;
  protected readonly routes = ROUTES;
  protected readonly titles = TITLES;
  protected readonly otherTitle = OTHER_TITLE;
  protected readonly provinces = PROVINCES;
  /** The sample's day: no date of birth after it */
  protected readonly today = TODAY;

  protected readonly draft = this.form.draft;
  protected readonly hnQuery = signal('');
  protected readonly ownerQuery = signal('');
  /** Clearing an owner picked from the search takes two presses */
  protected readonly clearArm = signal(false);
  /** Text typed into the breed box that matches no breed yet */
  private readonly breedTyped = signal<string | null>(null);
  /** "อื่นๆ" picked as the title, before anything is typed in its box */
  private readonly titleOther = signal(false);
  /** The address the fields show: current or registered */
  protected readonly addressKind = signal<AddressKind>('current');

  protected readonly hits = computed(() => searchPets(this.store.data(), this.hnQuery()));
  protected readonly owners = computed(() => searchOwners(this.store.data(), this.ownerQuery()));
  protected readonly fullName = computed(() => ownerFullName(this.draft()));
  protected readonly breeds = computed(() => BREEDS[this.draft().kind]);
  protected readonly breedText = computed(() => this.breedTyped() ?? this.draft().breed);
  protected readonly breedUnmatched = computed(() => !!this.breedTyped()?.trim());
  protected readonly age = computed(() => ageFromIso(this.draft().dob));
  /** The title's pick: one of the list, "อื่นๆ" for anything else typed, or none */
  protected readonly titleChoice = computed(() => {
    const title = this.draft().title.trim();
    return TITLES.includes(title) ? title : title || this.titleOther() ? OTHER_TITLE : '';
  });
  /** The address of an owner on file, while nothing new is typed over it */
  protected readonly onFileAddress = computed(() => {
    const d = this.draft();
    return !addressSummary(d.addresses) && d.ownerKey ? (this.store.data().owners[d.ownerKey]?.address ?? '').replace(/^—$/, '') : '';
  });
  protected readonly savedKind = computed(() => savedAddressKind(this.draft().addresses));
  /** Something typed into the address, but not enough to save it */
  protected readonly addressIncomplete = computed(() => !!addressSummary(this.draft().addresses) && !this.savedKind());
  protected readonly addressNote = computed(() => {
    if (!addressSummary(this.draft().addresses)) {
      return 'บันทึกเมื่อกรอกตำบล อำเภอ จังหวัด และรหัสไปรษณีย์ครบ';
    }
    const kind = this.savedKind();
    return kind === 'current' ? 'จะบันทึกที่อยู่ปัจจุบัน' : kind === 'house' ? 'จะบันทึกที่อยู่ตามทะเบียนบ้าน' : 'ที่อยู่ยังไม่ครบ (ตำบล อำเภอ จังหวัด รหัสไปรษณีย์) จึงยังไม่บันทึก';
  });
  protected readonly missing = computed(() => missingFields(this.draft()));
  protected readonly ready = computed(() => !this.missing().length);
  protected readonly missingText = computed(() => this.missing().map(m => this.i18n.t(m)).join(' · '));
  protected readonly speciesText = computed(() => speciesLabel(this.draft().kind));
  protected readonly idWarn = computed(() => !!this.form.record() && !this.draft().thaiId.trim());
  protected readonly canQueue = computed(() => {
    const r = this.form.record();
    return r ? !r.patient : this.ready();
  });
  protected readonly identity = computed(() => {
    const d = this.draft();
    const sex = d.sex === 'm' ? '♂ ' + this.i18n.t('ผู้') : d.sex === 'f' ? '♀ ' + this.i18n.t('เมีย') : this.i18n.t('ไม่ทราบเพศ');
    return [d.breed || this.i18n.t(speciesLabel(d.kind)), `${sex} ${this.i18n.t(d.neutered ? 'ทำหมันแล้ว' : 'ยังไม่ทำหมัน')}`, `${this.i18n.t('เจ้าของ')} ${this.fullName() || '—'}`].join(' · ');
  });

  protected readonly addressTabs = computed(() => {
    this.i18n.lang();
    return ADDRESS_TABS.map(t => ({ value: t.id, label: this.i18n.t(t.label) }));
  });

  protected readonly sexes = computed(() => {
    this.i18n.lang();
    return [
      { value: 'm' as Sex, label: '♂ ' + this.i18n.t('ผู้') },
      { value: 'f' as Sex, label: '♀ ' + this.i18n.t('เมีย') },
      { value: 'u' as Sex, label: this.i18n.t('ไม่ทราบ') },
    ];
  });
  protected readonly neuters = computed(() => {
    this.i18n.lang();
    return [{ value: false, label: this.i18n.t('ยังไม่ทำ') }, { value: true, label: this.i18n.t('ทำแล้ว') }];
  });

  protected set<K extends keyof RegistrationDraft>(key: K, value: RegistrationDraft[K]) {
    this.form.set(key, value);
  }

  protected pickTitle(value: string) {
    this.titleOther.set(value === OTHER_TITLE);
    this.set('title', value === OTHER_TITLE ? '' : value);
  }

  protected addr(key: keyof Address): string {
    return this.draft().addresses[this.addressKind()][key];
  }

  protected writeAddr(key: keyof Address, event: Event) {
    this.form.setAddress(this.addressKind(), key, (event.target as HTMLInputElement | HTMLSelectElement).value);
  }

  protected pickSpecies(kind: PetKind) {
    if (kind !== this.draft().kind) {
      // A breed belongs to one kind
      this.form.draft.update(d => ({ ...d, kind, breed: '' }));
      this.breedTyped.set(null);
    }
  }

  /** A breed is kept only when it is one of the catalogue's; anything else stays typed, and the form says it will not save */
  protected typeBreed(text: string) {
    const match = this.breeds().find(b => b.toLowerCase() === text.trim().toLowerCase() || this.i18n.t(b).toLowerCase() === text.trim().toLowerCase());
    this.set('breed', match ?? '');
    this.breedTyped.set(match ? null : text);
  }

  /** A list that lost focus closes, once a click inside it has landed */
  protected closeLater(query: { set: (v: string) => void }) {
    setTimeout(() => {
      if (!document.activeElement?.closest('.reg-lookup, .reg-owner-find')) {
        query.set('');
      }
    });
  }

  protected ownerOf(r: PetRecord): string {
    const o: Owner | undefined = this.store.data().owners[r.ownerKey];
    return o ? `${o.name} · ${o.phone}` : '—';
  }

  /** The first hit, as the desk's "receive the file" */
  protected receive() {
    const first = this.hits()[0];
    if (first) {
      this.load(first);
    }
  }

  protected load(r: PetRecord) {
    this.form.load(r, draftFromRecord(this.store.data(), r));
    // A pet in today's clinic: the context rail follows it
    if (r.patient) {
      this.store.select(r.patient);
    }
    this.hnQuery.set('');
    this.breedTyped.set(null);
    this.clearArm.set(false);
    this.titleOther.set(false);
    this.addressKind.set('current');
  }

  protected pickOwner(key: string, owner: Owner) {
    this.form.draft.set(draftFromOwner(this.draft(), key, owner));
    this.ownerQuery.set('');
    this.titleOther.set(false);
  }

  protected clearOwner() {
    this.form.draft.update(d => ({ ...d, ownerKey: null, title: '', first: '', last: '', phone: '', mobile: '', email: '', thaiId: '', addresses: emptyAddresses() }));
    this.clearArm.set(false);
    this.titleOther.set(false);
  }

  protected reset() {
    this.form.reset();
    this.hnQuery.set('');
    this.ownerQuery.set('');
    this.breedTyped.set(null);
    this.clearArm.set(false);
    this.titleOther.set(false);
    this.addressKind.set('current');
  }

  protected openPatient() {
    const p = this.form.record()?.patient;
    if (p) {
      this.store.select(p);
      this.ui.openSheet('patient', { tab: 'overview' });
    }
  }

  /** Save, or save and send to the queue; a pet on file only goes to the queue */
  protected save(queue: boolean) {
    const record = this.form.record();
    if (record) {
      if (queue && !record.patient) {
        const p = this.store.queuePet(record, this.form.route());
        this.done(p.pet, p.hn, true);
      }
      return;
    }
    if (!this.ready()) {
      return;
    }
    const found = findDuplicates(this.store.data(), this.draft());
    if (found.exact) {
      this.form.block.set(found.exact);
      return;
    }
    this.form.block.set(null);
    if (!found.probable.length) {
      this.commit(queue);
      return;
    }
    const facts = found.probable.map(c => [`${c.record.pet} · ${c.record.hn !== '—' ? c.record.hn : c.record.code}`, `${c.owner} · ${c.reasons.map(x => this.i18n.t(x)).join(', ')}`] as [string, string]);
    if (this.session.can('settings.manage')) {
      this.ui.ask({
        title: 'อาจเป็นข้อมูลซ้ำ — โปรดตรวจสอบ',
        intro: ['พบสัตว์ที่ข้อมูลคล้ายกันมาก อาจเป็นตัวเดียวกัน ตรวจสอบก่อนสร้างระเบียนใหม่'],
        facts,
        fields: [{
          name: 'reason', label: 'เหตุผลที่สร้างใหม่ (บันทึกไว้ในระเบียน)', type: 'input', placeholder: 'เช่น เป็นคนละตัวกัน ชื่อซ้ำกันโดยบังเอิญ',
          validate: v => (v.trim().length >= REASON_MIN ? null : `อย่างน้อย ${REASON_MIN} ตัวอักษร — ข้อความนี้คือหลักฐานตรวจสอบ`),
        }],
        tone: 'danger',
        confirmLabel: 'ยืนยันสร้างใหม่',
        onConfirm: values => this.commit(queue, values['reason'].trim()),
      });
    } else {
      this.ui.ask({
        title: 'อาจเป็นข้อมูลซ้ำ — โปรดตรวจสอบ',
        intro: ['พบสัตว์ที่ข้อมูลคล้ายกันมาก อาจเป็นตัวเดียวกัน', 'การสร้างระเบียนใหม่ทั้งที่อาจซ้ำทำได้เฉพาะผู้ดูแลระบบ'],
        facts,
        confirmLabel: 'เปิดระเบียนเดิม',
        onConfirm: () => this.load(found.probable[0].record),
      });
    }
  }

  private commit(queue: boolean, forceReason?: string) {
    const d = this.draft();
    const result = this.store.register(d, queue ? this.form.route() : null, forceReason);
    if (result.patient) {
      this.done(d.pet.trim(), result.hn, true);
      return;
    }
    this.ui.toast('ลงทะเบียน {pet} แล้ว · {code}', { pet: d.pet.trim(), code: result.code });
    const record = searchPets(this.store.data(), result.code)[0];
    if (record) {
      this.load(record);
    }
  }

  private done(pet: string, hn: string, queued: boolean) {
    if (queued) {
      this.ui.toast('ส่ง {pet} เข้าคิวแล้ว · {hn}', { pet, hn });
      this.reset();
      void this.router.navigate(['/clinic/queue']);
    }
  }
}
