import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';

import { Error500Component } from './error500.component';

describe('Error500Component', () => {
  let component: Error500Component;
  let fixture: ComponentFixture<Error500Component>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Error500Component],
      providers: [provideRouter([]), provideTranslateService()],
    })
    .compileComponents();

    fixture = TestBed.createComponent(Error500Component);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
