import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { DrawerModule } from 'primeng/drawer';

interface ReviewAlertItem {
  raw: string;
  severity: 'error' | 'warn';
  title: string;
  detail: string;
  targetId: string | null;
}

@Component({
  imports: [DrawerModule],
  selector: 'app-review-alerts',
  templateUrl: './review-alerts.html',
})
export class ReviewAlerts {
  private readonly document = inject(DOCUMENT);

  readonly validationErrors = input<string[]>([]);
  readonly warnings = input<string[]>([]);
  readonly drawerOpen = signal(false);
  readonly hasAlerts = computed(() => this.validationErrors().length > 0 || this.warnings().length > 0);
  readonly alertItems = computed(() => {
    const seen = new Set<string>();
    return [
      ...this.validationErrors().map((message) => this.toAlert(message, 'error')),
      ...this.warnings().map((message) => this.toAlert(message, 'warn')),
    ].filter((item) => {
      const key = `${item.severity}:${item.title}:${item.targetId ?? item.detail}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  });
  readonly errorCount = computed(() => this.alertItems().filter((item) => item.severity === 'error').length);
  readonly warningCount = computed(() => this.alertItems().filter((item) => item.severity === 'warn').length);
  readonly issueCount = computed(() => this.alertItems().length);
  readonly issueState = computed<'error' | 'warn'>(() => (this.errorCount() > 0 ? 'error' : 'warn'));

  focusAlertTarget(item: ReviewAlertItem): void {
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
    this.drawerOpen.set(false);
  }

  private toAlert(raw: string, severity: 'error' | 'warn'): ReviewAlertItem {
    const lineMatch = raw.match(/lines\[(\d+)\](?:\.([a-z_]+))?/);
    if (lineMatch) {
      const rowNumber = Number(lineMatch[1]) + 1;
      const field = lineMatch[2] ?? this.lineFieldFromMessage(raw);
      return {
        raw,
        severity,
        title: this.lineTitle(rowNumber, field, raw),
        detail: this.lineDetail(field, raw),
        targetId: `line-${lineMatch[1]}-${field}`,
      };
    }

    const field = this.invoiceFieldFromMessage(raw);
    if (field) {
      return {
        raw,
        severity,
        title: this.invoiceTitle(field),
        detail: this.invoiceDetail(field, raw),
        targetId: `invoice-${field}`,
      };
    }

    if (raw.toLowerCase().includes('confidence')) {
      return {
        raw,
        severity: 'warn',
        title: 'Review low-confidence extraction',
        detail: 'Some extracted values may be uncertain. Check the invoice image and review the highlighted fields before submitting.',
        targetId: 'quality-gate',
      };
    }

    return {
      raw,
      severity,
      title: severity === 'error' ? 'Review required' : 'Attention needed',
      detail: this.cleanRawMessage(raw),
      targetId: null,
    };
  }

  private lineFieldFromMessage(message: string): string {
    if (message.includes('quantity') || message.includes('unit_price') || message.includes('mismatch')) {
      return 'amount';
    }
    if (message.includes('tax')) {
      return 'tax_code';
    }
    if (message.includes('description')) {
      return 'description';
    }
    if (message.includes('unit')) {
      return 'unit';
    }
    return 'amount';
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
      return 'Check quantity, unit price, and amount. Accounting recalculates line totals before accepting the invoice.';
    }
    if (field === 'unit') {
      return 'Add the unit shown on the invoice, such as pcs, hours, set, lot, or a Japanese unit label.';
    }
    if (field === 'description') {
      return 'Add a short item description from the invoice line.';
    }
    if (field === 'tax_code') {
      return 'Use one of the supported tax codes: T10 or T08.';
    }
    return this.cleanRawMessage(message);
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
      return 'Choose the supplier from the accounting master before submitting.';
    }
    if (field === 'subtotal' || field === 'tax_amount' || field === 'total_amount') {
      return 'Click Recalculate or adjust the line items so totals match accounting rules.';
    }
    if (field === 'supplier_registration_number') {
      return 'Use a valid Japanese registration number: T plus 13 digits, or 13 digits.';
    }
    return this.cleanRawMessage(message);
  }

  private cleanRawMessage(message: string): string {
    return message.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
