import { Component, inject, signal } from '@angular/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';

import { PartnerOption, RegisteredInvoiceOption, TaxCodeOption } from '../../models/invoice-review.models';
import { InvoiceApiService } from '../../services/invoice-api.service';

type SupportView = 'partners' | 'tax' | 'registered';

@Component({
  imports: [ButtonModule, ConfirmDialogModule, DialogModule, MessageModule, TableModule],
  selector: 'app-empty-review-state',
  template: `
    <p-confirmdialog key="reset-registered-invoices" appendTo="body" />

    <div class="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-sky-700">Invoice Intake</p>
          <h2 class="mt-1 text-xl font-semibold text-slate-950">Upload an invoice to begin review</h2>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Extract invoice data, review uncertain fields, validate supplier and tax rules, then submit the corrected invoice into accounting.
          </p>
        </div>
        <div class="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-700 md:flex">
          <i class="pi pi-sparkles text-xl"></i>
        </div>
      </div>

      @if (message()) {
        <div class="mt-5">
          <p-message [severity]="messageSeverity()" variant="outlined" [closable]="true" closeIcon="pi pi-times">{{ message() }}</p-message>
        </div>
      }

      <div class="mt-6 grid gap-4 lg:grid-cols-2">
        <section class="rounded-md border border-slate-200 bg-slate-50 p-4">
          <h3 class="text-sm font-semibold text-slate-900">What you can upload</h3>
          <ul class="mt-3 space-y-2 text-sm text-slate-600">
            <li class="flex gap-2"><i class="pi pi-check mt-1 text-xs text-emerald-600"></i><span>PDF invoices, including text-layer PDFs and scanned PDFs</span></li>
            <li class="flex gap-2"><i class="pi pi-check mt-1 text-xs text-emerald-600"></i><span>JPG, JPEG, and PNG invoice images</span></li>
            <li class="flex gap-2"><i class="pi pi-check mt-1 text-xs text-emerald-600"></i><span>Japanese supplier names, invoice totals, due dates, and line-item tables</span></li>
          </ul>
        </section>

        <section class="rounded-md border border-slate-200 bg-slate-50 p-4">
          <h3 class="text-sm font-semibold text-slate-900">What happens before submission</h3>
          <ul class="mt-3 space-y-2 text-sm text-slate-600">
            <li class="flex gap-2"><i class="pi pi-check mt-1 text-xs text-emerald-600"></i><span>Supplier is matched against the accounting master</span></li>
            <li class="flex gap-2"><i class="pi pi-check mt-1 text-xs text-emerald-600"></i><span>Amounts, tax codes, dates, and duplicate invoices are checked</span></li>
            <li class="flex gap-2"><i class="pi pi-check mt-1 text-xs text-emerald-600"></i><span>Low-confidence or invalid data stays in review until corrected</span></li>
          </ul>
        </section>
      </div>

      <section class="mt-5 rounded-md border border-slate-200 p-4">
        <h3 class="text-sm font-semibold text-slate-900">Review tools</h3>
        <div class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <button class="feature-link-card" pButton type="button" variant="outlined" severity="secondary" [loading]="loading() === 'partners'" (click)="openPartners()">
            <i class="pi pi-users text-sky-700"></i>
            <span>
              <strong>Supplier directory</strong>
              <small>Open the approved supplier list used for matching</small>
            </span>
          </button>

          <button class="feature-link-card" pButton type="button" variant="outlined" severity="secondary" [loading]="loading() === 'tax'" (click)="openTaxCodes()">
            <i class="pi pi-percentage text-emerald-700"></i>
            <span>
              <strong>Tax setup</strong>
              <small>See the tax codes accepted during registration</small>
            </span>
          </button>

          <button class="feature-link-card" pButton type="button" variant="outlined" severity="secondary" [loading]="loading() === 'registered'" (click)="openRegisteredInvoices()">
            <i class="pi pi-receipt text-indigo-700"></i>
            <span>
              <strong>Submission history</strong>
              <small>Review invoices already submitted in this session</small>
            </span>
          </button>

          <button class="feature-link-card" pButton type="button" variant="outlined" severity="danger" [loading]="loading() === 'reset'" (click)="confirmReset($event)">
            <i class="pi pi-refresh text-red-700"></i>
            <span>
              <strong>Start clean</strong>
              <small>Clear submitted test invoices from the session</small>
            </span>
          </button>
        </div>
      </section>
    </div>

    <p-dialog
      [header]="dialogTitle()"
      appendTo="body"
      styleClass="support-data-dialog"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      [style]="{ width: 'min(920px, 94vw)' }"
      [visible]="dialogOpen()"
      (visibleChange)="dialogOpen.set($event)"
    >
      @if (activeView() === 'partners') {
        <p-table [value]="partners()" size="small" [showGridlines]="true" [stripedRows]="true">
          <ng-template #header>
            <tr>
              <th>Code</th>
              <th>Supplier</th>
              <th>Aliases</th>
              <th>Registration no.</th>
            </tr>
          </ng-template>
          <ng-template #body let-partner>
            <tr>
              <td class="font-semibold">{{ partner.partner_code }}</td>
              <td>{{ partner.name }}</td>
              <td>{{ (partner.aliases || []).join(', ') || '-' }}</td>
              <td>{{ partner.registration_no || '-' }}</td>
            </tr>
          </ng-template>
        </p-table>
      } @else if (activeView() === 'tax') {
        <p-table [value]="taxCodes()" size="small" [showGridlines]="true" [stripedRows]="true">
          <ng-template #header>
            <tr>
              <th>Tax code</th>
              <th>Rate</th>
              <th>Description</th>
            </tr>
          </ng-template>
          <ng-template #body let-taxCode>
            <tr>
              <td class="font-semibold">{{ taxCode.tax_code }}</td>
              <td>{{ taxCode.rate * 100 }}%</td>
              <td>{{ taxCode.label }}</td>
            </tr>
          </ng-template>
        </p-table>
      } @else if (activeView() === 'registered') {
        <p-table [value]="registeredInvoices()" size="small" [showGridlines]="true" [stripedRows]="true">
          <ng-template #header>
            <tr>
              <th>Accounting ID</th>
              <th>Supplier</th>
              <th>Invoice no.</th>
              <th>Due date</th>
              <th>Total</th>
              <th>Lines</th>
            </tr>
          </ng-template>
          <ng-template #body let-invoice>
            <tr>
              <td class="font-semibold">{{ invoice.accounting_id }}</td>
              <td>{{ invoice.partner_code }}</td>
              <td>{{ invoice.invoice_number }}</td>
              <td>{{ invoice.due_date }}</td>
              <td>{{ invoice.total_amount }}</td>
              <td>{{ invoice.line_count }}</td>
            </tr>
          </ng-template>
          <ng-template #emptymessage>
            <tr>
              <td colspan="6" class="py-6 text-center text-sm text-slate-500">No invoices have been submitted in this session.</td>
            </tr>
          </ng-template>
        </p-table>
      }
    </p-dialog>
  `,
})
export class EmptyReviewState {
  private readonly invoiceApi = inject(InvoiceApiService);
  private readonly confirmationService = inject(ConfirmationService);

  readonly activeView = signal<SupportView | null>(null);
  readonly dialogOpen = signal(false);
  readonly loading = signal<SupportView | 'reset' | null>(null);
  readonly message = signal('');
  readonly messageSeverity = signal<'success' | 'error' | 'info'>('info');
  readonly partners = signal<PartnerOption[]>([]);
  readonly taxCodes = signal<TaxCodeOption[]>([]);
  readonly registeredInvoices = signal<RegisteredInvoiceOption[]>([]);
  readonly dialogTitle = signal('');

  openPartners(): void {
    this.loading.set('partners');
    this.invoiceApi
      .listPartners()
      .subscribe({
        next: (partners) => {
          this.partners.set(partners);
          this.openDialog('partners', 'Supplier directory');
        },
        error: () => this.showMessage('error', 'Could not load the supplier directory. Check that the backend and accounting service are running.'),
      })
      .add(() => this.loading.set(null));
  }

  openTaxCodes(): void {
    this.loading.set('tax');
    this.invoiceApi
      .listTaxCodes()
      .subscribe({
        next: (taxCodes) => {
          this.taxCodes.set(taxCodes);
          this.openDialog('tax', 'Tax setup');
        },
        error: () => this.showMessage('error', 'Could not load tax setup. Check that the backend and accounting service are running.'),
      })
      .add(() => this.loading.set(null));
  }

  openRegisteredInvoices(): void {
    this.loading.set('registered');
    this.invoiceApi
      .listRegisteredInvoices()
      .subscribe({
        next: (invoices) => {
          this.registeredInvoices.set(invoices);
          this.openDialog('registered', 'Submission history');
        },
        error: () => this.showMessage('error', 'Could not load submission history. Check that the backend and accounting service are running.'),
      })
      .add(() => this.loading.set(null));
  }

  confirmReset(event: Event): void {
    this.confirmationService.confirm({
      key: 'reset-registered-invoices',
      target: event.currentTarget ?? undefined,
      header: 'Start with a clean session?',
      message: 'This clears submitted test invoices so you can run the demo again.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Clear session',
      rejectLabel: 'Cancel',
      acceptIcon: 'pi pi-refresh',
      rejectIcon: 'pi pi-times',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      defaultFocus: 'reject',
      accept: () => this.resetRegisteredInvoices(),
    });
  }

  private resetRegisteredInvoices(): void {
    this.loading.set('reset');
    this.invoiceApi
      .clearRegisteredInvoices()
      .subscribe({
        next: (result) => {
          this.registeredInvoices.set([]);
          this.showMessage('success', `Session cleared. Removed ${result.removed} submitted invoice${result.removed === 1 ? '' : 's'}.`);
        },
        error: () => this.showMessage('error', 'Could not clear the session. Check that the backend and accounting service are running.'),
      })
      .add(() => this.loading.set(null));
  }

  private openDialog(view: SupportView, title: string): void {
    this.activeView.set(view);
    this.dialogTitle.set(title);
    this.dialogOpen.set(true);
    this.message.set('');
  }

  private showMessage(severity: 'success' | 'error' | 'info', message: string): void {
    this.messageSeverity.set(severity);
    this.message.set(message);
  }
}
