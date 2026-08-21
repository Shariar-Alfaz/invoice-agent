import { Component, computed, input, output, signal } from '@angular/core';

import { InvoiceFields } from '../invoice-fields/invoice-fields';
import { LineItemsTable } from '../line-items-table/line-items-table';
import { ReviewAlerts } from '../review-alerts/review-alerts';
import { ReviewSummary } from '../review-summary/review-summary';
import { SubmitBar } from '../submit-bar/submit-bar';
import { ClientValidationState, InvoiceFieldChange, LineFieldChange, PartnerOption, ProcessingResult } from '../../models/invoice-review.models';

@Component({
  imports: [InvoiceFields, LineItemsTable, ReviewAlerts, ReviewSummary, SubmitBar],
  selector: 'app-review-detail',
  templateUrl: './review-detail.html',
})
export class ReviewDetail {
  readonly result = input.required<ProcessingResult>();
  readonly partners = input<PartnerOption[]>([]);
  readonly submitting = input(false);
  readonly hasManualEdits = input(false);
  readonly submitted = computed(() => Boolean(this.result().accounting_response));
  readonly invoiceValidation = signal<ClientValidationState>({ invalid: false, errors: [] });
  readonly lineValidation = signal<ClientValidationState>({ invalid: false, errors: [] });
  readonly clientValidationErrors = computed(() => [...this.invoiceValidation().errors, ...this.lineValidation().errors]);
  readonly visibleValidationErrors = computed(() => {
    if (this.hasManualEdits()) {
      return this.clientValidationErrors();
    }
    return [...this.result().validation_errors, ...this.clientValidationErrors()];
  });

  readonly addLine = output<void>();
  readonly removeLine = output<number>();
  readonly recalculate = output<void>();
  readonly refreshPartners = output<void>();
  readonly approveReviewedEdits = output<void>();
  readonly submitReviewed = output<void>();
  readonly invoiceFieldChange = output<InvoiceFieldChange>();
  readonly lineFieldChange = output<LineFieldChange>();
  readonly partnerCodeChange = output<string | null>();

  updatePartnerCode(partnerCode: string | null): void {
    this.partnerCodeChange.emit(partnerCode);
  }

  updateInvoiceValidation(state: ClientValidationState): void {
    this.invoiceValidation.set(state);
  }

  updateLineValidation(state: ClientValidationState): void {
    this.lineValidation.set(state);
  }
}
