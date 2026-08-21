import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageModule } from 'primeng/message';

interface SubmitAlertItem {
  raw: string;
  title: string;
  detail: string;
  targetId: string | null;
}

@Component({
  imports: [ButtonModule, ConfirmDialogModule, MessageModule],
  selector: 'app-submit-bar',
  templateUrl: './submit-bar.html',
})
export class SubmitBar {
  private readonly document = inject(DOCUMENT);
  private readonly confirmationService = inject(ConfirmationService);

  readonly submitting = input(false);
  readonly validationErrors = input<string[]>([]);
  readonly clientValidationErrors = input<string[]>([]);
  readonly warnings = input<string[]>([]);
  readonly hasManualEdits = input(false);
  readonly submitted = input(false);
  readonly approveReviewedEdits = output<void>();
  readonly submitReviewed = output<void>();
  readonly hasOpenReviewMessages = computed(() => this.validationErrors().length > 0 || this.warnings().length > 0);
  readonly canApprove = computed(() => !this.submitted() && this.clientValidationErrors().length === 0 && (this.hasManualEdits() || this.hasOpenReviewMessages()));
  readonly canSubmit = computed(() => this.clientValidationErrors().length === 0 && this.validationErrors().length === 0 && !this.hasManualEdits() && !this.hasOpenReviewMessages());
  readonly visibleErrors = computed(() => {
    const seen = new Set<string>();
    const messages = this.hasManualEdits() ? this.clientValidationErrors() : [...this.clientValidationErrors(), ...this.validationErrors()];
    return messages
      .map((message) => this.toAlert(message))
      .filter((item) => {
        const key = `${item.title}:${item.targetId ?? item.detail}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .slice(0, 3);
  });

  readonly statusText = computed(() => {
    if (this.submitted()) {
      return 'Invoice registered in accounting.';
    }
    if (this.clientValidationErrors().length > 0) {
      return 'Fix the highlighted form errors before submitting to accounting.';
    }
    if (this.canApprove()) {
      return 'Approve the reviewed edits to clear resolved issues before submitting.';
    }
    if (this.validationErrors().length > 0 && this.hasManualEdits()) {
      return 'Reviewer edits changed the invoice. Submit again to revalidate and register.';
    }
    if (this.validationErrors().length > 0) {
      return 'Fix validation errors, then submit the reviewed invoice.';
    }
    return 'Validated locally. Submit the reviewed invoice to accounting.';
  });

  focusErrorTarget(item: SubmitAlertItem): void {
    if (!item.targetId) {
      return;
    }

    const target = this.document.getElementById(item.targetId);
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    target.classList.remove('review-target-marker');
    window.setTimeout(() => target.classList.add('review-target-marker'), 20);
    window.setTimeout(() => target.classList.remove('review-target-marker'), 2200);

    const focusable = target.matches('input, button, select, textarea, [tabindex]')
      ? target
      : target.querySelector<HTMLElement>('input, button, select, textarea, [tabindex]');
    focusable?.focus({ preventScroll: true });
  }

  confirmApproveEdits(event: Event): void {
    this.confirmationService.confirm({
      key: 'approve-reviewed-edits',
      target: event.currentTarget ?? undefined,
      header: 'Approve reviewed edits?',
      message: 'This confirms the current corrections and clears resolved review issues. You can still edit the invoice before submitting to accounting.',
      icon: 'pi pi-check-circle',
      acceptLabel: 'Approve edits',
      rejectLabel: 'Cancel',
      acceptIcon: 'pi pi-check',
      rejectIcon: 'pi pi-times',
      acceptButtonStyleClass: 'p-button-success',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      defaultFocus: 'reject',
      accept: () => this.approveReviewedEdits.emit(),
    });
  }

  private toAlert(raw: string): SubmitAlertItem {
    const lineMatch = raw.match(/lines\[(\d+)\](?:\.([a-z_]+))?/);
    if (lineMatch) {
      const rowNumber = Number(lineMatch[1]) + 1;
      const field = lineMatch[2] ?? (raw.includes('mismatch') || raw.includes('quantity x unit_price') ? 'amount' : 'amount');
      return {
        raw,
        title: this.lineTitle(rowNumber, field, raw),
        detail: this.lineDetail(field, raw),
        targetId: `line-${lineMatch[1]}-${field}`,
      };
    }

    const field = this.invoiceFieldFromMessage(raw);
    if (field) {
      return {
        raw,
        title: this.invoiceTitle(field),
        detail: this.invoiceDetail(field, raw),
        targetId: `invoice-${field}`,
      };
    }

    return {
      raw,
      title: 'Review required',
      detail: raw.replace(/_/g, ' ').replace(/\s+/g, ' ').trim(),
      targetId: null,
    };
  }

  private lineTitle(rowNumber: number, field: string, message: string): string {
    if (message.includes('mismatch') || message.includes('quantity x unit_price')) {
      return `Line ${rowNumber}: amount does not match`;
    }
    if (field === 'unit') {
      return `Line ${rowNumber}: unit is missing`;
    }
    if (field === 'description') {
      return `Line ${rowNumber}: description is missing`;
    }
    if (field === 'tax_code') {
      return `Line ${rowNumber}: tax code needs review`;
    }
    return `Line ${rowNumber}: amount needs review`;
  }

  private lineDetail(field: string, message: string): string {
    if (message.includes('mismatch') || message.includes('quantity x unit_price')) {
      return 'Check quantity, unit price, and amount so the line total matches.';
    }
    if (field === 'unit') {
      return 'Add the unit from the invoice line before submitting.';
    }
    if (field === 'description') {
      return 'Add a short item description from the invoice.';
    }
    if (field === 'tax_code') {
      return 'Use T10 or T08.';
    }
    return 'Review this line before submitting.';
  }

  private invoiceFieldFromMessage(message: string): string | null {
    const lower = message.toLowerCase();
    if (lower.includes('registration number')) {
      return 'supplier_registration_number';
    }
    if (lower.includes('supplier') || lower.includes('partner')) {
      return 'partner_code';
    }
    if (lower.includes('subtotal')) {
      return 'subtotal';
    }
    if (lower.includes('tax amount')) {
      return 'tax_amount';
    }
    if (lower.includes('total')) {
      return 'total_amount';
    }
    if (lower.includes('due date')) {
      return 'due_date';
    }
    if (lower.includes('issue date')) {
      return 'issue_date';
    }
    if (lower.includes('invoice number')) {
      return 'invoice_number';
    }
    return null;
  }

  private invoiceTitle(field: string): string {
    const titles: Record<string, string> = {
      partner_code: 'Select an approved supplier',
      subtotal: 'Subtotal needs review',
      tax_amount: 'Tax amount needs review',
      total_amount: 'Total amount needs review',
      due_date: 'Due date needs review',
      issue_date: 'Issue date needs review',
      invoice_number: 'Invoice number needs review',
      supplier_registration_number: 'Registration number needs review',
    };
    return titles[field] ?? 'Invoice field needs review';
  }

  private invoiceDetail(field: string, message: string): string {
    if (field === 'partner_code') {
      return 'Choose the supplier from the accounting master.';
    }
    if (field === 'subtotal' || field === 'tax_amount' || field === 'total_amount') {
      return 'Click Recalculate or adjust line items so totals match.';
    }
    if (field === 'supplier_registration_number') {
      return 'Use T plus 13 digits, or 13 digits.';
    }
    return message.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
