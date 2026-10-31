import { Routes } from '@angular/router';

import { ActivityComponent } from './pages/home/activity.component';
import { AlertsComponent } from './pages/home/alerts.component';
import { ApprovalsComponent } from './pages/home/approvals.component';
import { OverviewComponent } from './pages/home/overview.component';
import { AdjustmentsComponent } from './pages/finance/adjustments.component';
import { ExportsComponent } from './pages/finance/exports.component';
import { FinanceOverviewComponent } from './pages/finance/finance-overview.component';
import { InvoiceDetailComponent } from './pages/finance/invoice-detail.component';
import { InvoicesComponent } from './pages/finance/invoices.component';
import { PaymentsComponent } from './pages/finance/payments.component';
import { ReceivablesComponent } from './pages/finance/receivables.component';
import { ReconciliationComponent } from './pages/finance/reconciliation.component';
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
      { path: '**', redirectTo: 'home/overview' },
    ],
  },
];
