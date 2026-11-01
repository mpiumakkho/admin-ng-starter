import { Routes } from '@angular/router';

import { ActivityComponent } from './pages/home/activity.component';
import { AlertsComponent } from './pages/home/alerts.component';
import { ApprovalsComponent } from './pages/home/approvals.component';
import { OverviewComponent } from './pages/home/overview.component';
import { CalibrationComponent } from './pages/assets/calibration.component';
import { ContractsComponent } from './pages/assets/contracts.component';
import { CriticalComponent } from './pages/assets/critical.component';
import { DecommissionComponent } from './pages/assets/decommission.component';
import { DowntimeComponent } from './pages/assets/downtime.component';
import { EquipmentDetailComponent } from './pages/assets/equipment-detail.component';
import { PmComponent } from './pages/assets/pm.component';
import { RegistryComponent } from './pages/assets/registry.component';
import { AdjustmentsComponent } from './pages/finance/adjustments.component';
import { ExportsComponent } from './pages/finance/exports.component';
import { FinanceOverviewComponent } from './pages/finance/finance-overview.component';
import { InvoiceDetailComponent } from './pages/finance/invoice-detail.component';
import { InvoicesComponent } from './pages/finance/invoices.component';
import { PaymentsComponent } from './pages/finance/payments.component';
import { ReceivablesComponent } from './pages/finance/receivables.component';
import { ReconciliationComponent } from './pages/finance/reconciliation.component';
import { ControlledComponent } from './pages/inventory/controlled.component';
import { DispensesComponent } from './pages/inventory/dispenses.component';
import { InventoryOverviewComponent } from './pages/inventory/inventory-overview.component';
import { ItemDetailComponent } from './pages/inventory/item-detail.component';
import { LotsComponent } from './pages/inventory/lots.component';
import { RecallComponent } from './pages/inventory/recall.component';
import { ReceiptsComponent } from './pages/inventory/receipts.component';
import { ReorderComponent } from './pages/inventory/reorder.component';
import { StockComponent } from './pages/inventory/stock.component';
import { AuditExplorerComponent } from './pages/quality/audit-explorer.component';
import { AuditExportsComponent } from './pages/quality/audit-exports.component';
import { AuditIntegrityComponent } from './pages/quality/audit-integrity.component';
import { BreachDetailComponent } from './pages/quality/breach-detail.component';
import { BreachComponent } from './pages/quality/breach.component';
import { ComplaintsComponent } from './pages/quality/complaints.component';
import { ConsentComponent } from './pages/quality/consent.component';
import { CultureComponent } from './pages/quality/culture.component';
import { DsarDetailComponent } from './pages/quality/dsar-detail.component';
import { DsarComponent } from './pages/quality/dsar.component';
import { IncidentsComponent } from './pages/quality/incidents.component';
import { InvestigationComponent } from './pages/quality/investigation.component';
import { KpiComponent } from './pages/quality/kpi.component';
import { NearMissComponent } from './pages/quality/near-miss.component';
import { PdpaOverviewComponent } from './pages/quality/pdpa-overview.component';
import { QualityOverviewComponent } from './pages/quality/quality-overview.component';
import { RcaComponent } from './pages/quality/rca.component';
import { ResolutionComponent } from './pages/quality/resolution.component';
import { RetentionComponent } from './pages/quality/retention.component';
import { RopaComponent } from './pages/quality/ropa.component';
import { ClaimsComponent } from './pages/sales/claims.component';
import { LineCrmComponent } from './pages/sales/line-crm.component';
import { RevenueOverviewComponent } from './pages/sales/revenue-overview.component';
import { CredentialsComponent } from './pages/workforce/credentials.component';
import { EducationComponent } from './pages/workforce/education.component';
import { LeaveComponent } from './pages/workforce/leave.component';
import { OnCallComponent } from './pages/workforce/on-call.component';
import { OvertimeComponent } from './pages/workforce/overtime.component';
import { PrivilegesComponent } from './pages/workforce/privileges.component';
import { ScheduleComponent } from './pages/workforce/schedule.component';
import { StaffDetailComponent } from './pages/workforce/staff-detail.component';
import { StaffComponent } from './pages/workforce/staff.component';
import { BackofficeShellComponent } from './shell/backoffice-shell.component';

/** The back office's pages, under /backoffice, by the spec's menu groups (shell/nav.ts) */
export const BACKOFFICE_ROUTES: Routes = [
  {
    path: '',
    component: BackofficeShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home/overview' },
      { path: 'home', pathMatch: 'full', redirectTo: 'home/overview' },
      { path: 'home/overview', component: OverviewComponent },
      { path: 'home/approvals', component: ApprovalsComponent },
      { path: 'home/alerts', component: AlertsComponent },
      { path: 'home/activity', component: ActivityComponent },
      { path: 'finance', pathMatch: 'full', redirectTo: 'finance/overview' },
      { path: 'finance/overview', component: FinanceOverviewComponent },
      { path: 'finance/invoices', component: InvoicesComponent },
      { path: 'finance/invoices/:id', component: InvoiceDetailComponent },
      { path: 'finance/payments', component: PaymentsComponent },
      { path: 'finance/adjustments', component: AdjustmentsComponent },
      { path: 'finance/receivables', component: ReceivablesComponent },
      { path: 'finance/reconciliation', component: ReconciliationComponent },
      { path: 'finance/exports', component: ExportsComponent },
      { path: 'inventory', pathMatch: 'full', redirectTo: 'inventory/overview' },
      { path: 'inventory/overview', component: InventoryOverviewComponent },
      { path: 'inventory/stock', component: StockComponent },
      { path: 'inventory/items/:id', component: ItemDetailComponent },
      { path: 'inventory/lots', component: LotsComponent },
      { path: 'inventory/receipts', component: ReceiptsComponent },
      { path: 'inventory/dispenses', component: DispensesComponent },
      { path: 'inventory/reorder', component: ReorderComponent },
      { path: 'inventory/controlled', component: ControlledComponent },
      { path: 'inventory/recall', component: RecallComponent },
      { path: 'sales', pathMatch: 'full', redirectTo: 'sales/overview' },
      { path: 'sales/overview', component: RevenueOverviewComponent },
      { path: 'sales/line', component: LineCrmComponent },
      { path: 'sales/claims', component: ClaimsComponent },
      { path: 'workforce', pathMatch: 'full', redirectTo: 'workforce/staff' },
      { path: 'workforce/staff', component: StaffComponent },
      { path: 'workforce/staff/:id', component: StaffDetailComponent },
      { path: 'workforce/credentials', component: CredentialsComponent },
      { path: 'workforce/education', component: EducationComponent },
      { path: 'workforce/privileges', component: PrivilegesComponent },
      { path: 'workforce/schedule', component: ScheduleComponent },
      { path: 'workforce/leave', component: LeaveComponent },
      { path: 'workforce/on-call', component: OnCallComponent },
      { path: 'workforce/overtime', component: OvertimeComponent },
      { path: 'assets', pathMatch: 'full', redirectTo: 'assets/registry' },
      { path: 'assets/registry', component: RegistryComponent },
      { path: 'assets/equipment/:id', component: EquipmentDetailComponent },
      { path: 'assets/pm', component: PmComponent },
      { path: 'assets/calibration', component: CalibrationComponent },
      { path: 'assets/downtime', component: DowntimeComponent },
      { path: 'assets/critical', component: CriticalComponent },
      { path: 'assets/contracts', component: ContractsComponent },
      { path: 'assets/decommission', component: DecommissionComponent },
      { path: 'quality', pathMatch: 'full', redirectTo: 'quality/overview' },
      { path: 'quality/overview', component: QualityOverviewComponent },
      { path: 'quality/incidents', component: IncidentsComponent },
      { path: 'quality/near-miss', component: NearMissComponent },
      { path: 'quality/rca', component: RcaComponent },
      { path: 'quality/kpi', component: KpiComponent },
      { path: 'quality/culture', component: CultureComponent },
      { path: 'quality/complaints', component: ComplaintsComponent },
      { path: 'quality/investigation', component: InvestigationComponent },
      { path: 'quality/resolution', component: ResolutionComponent },
      { path: 'quality/pdpa', component: PdpaOverviewComponent },
      { path: 'quality/dsar', component: DsarComponent },
      { path: 'quality/dsar/:id', component: DsarDetailComponent },
      { path: 'quality/consent', component: ConsentComponent },
      { path: 'quality/breach', component: BreachComponent },
      { path: 'quality/breach/:id', component: BreachDetailComponent },
      { path: 'quality/retention', component: RetentionComponent },
      { path: 'quality/ropa', component: RopaComponent },
      { path: 'quality/audit', component: AuditExplorerComponent },
      { path: 'quality/audit-exports', component: AuditExportsComponent },
      { path: 'quality/audit-integrity', component: AuditIntegrityComponent },
      { path: '**', redirectTo: 'home/overview' },
    ],
  },
];
