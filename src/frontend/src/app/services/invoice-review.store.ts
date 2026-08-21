import { HttpErrorResponse } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { computed, inject, Injectable, signal } from '@angular/core';
import { retry } from 'rxjs';

import { InvoiceApiService } from './invoice-api.service';
import { InvoiceFieldChange, InvoiceLine, LineFieldChange, PartnerOption, ProcessingResult } from '../models/invoice-review.models';

const TAX_RATES: Record<string, number> = {
  T08: 0.08,
  T10: 0.1,
};

const PDF_VIEWER_OPTIONS = '#toolbar=0&navpanes=0&scrollbar=0';
const DISCOUNT_KEYWORDS = ['値引', '割引', 'discount', 'rebate', 'credit', 'adjustment'];

@Injectable({
  providedIn: 'root',
})
export class InvoiceReviewStore {
  private readonly invoiceApi = inject(InvoiceApiService);
  private readonly sanitizer = inject(DomSanitizer);
  private objectUrl: string | null = null;

  readonly selectedFile = signal<File | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly previewResourceUrl = signal<SafeResourceUrl | null>(null);
  readonly result = signal<ProcessingResult | null>(null);
  readonly partners = signal<PartnerOption[]>([]);
  readonly errorMessage = signal('');
  readonly working = signal(false);
  readonly submitting = signal(false);
  readonly hasManualEdits = signal(false);
  readonly hasAccountingResponse = computed(() => Boolean(this.result()?.accounting_response));
  readonly previewType = computed<'image' | 'pdf' | 'unsupported' | 'empty'>(() => {
    const file = this.selectedFile();
    if (!file) {
      return 'empty';
    }

    if (file.type.startsWith('image/')) {
      return 'image';
    }

    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'unsupported';
  });

  loadPartners(): void {
    this.invoiceApi
      .listPartners()
      .pipe(retry({ count: 2, delay: 500 }))
      .subscribe({
        next: (partners) => {
          this.partners.set(partners);
        },
        error: () => {
          this.partners.set([]);
        },
      });
  }

  updateSelectedFile(file: File | null): void {
    this.revokePreviewUrl();
    this.selectedFile.set(file);
    const nextUrl = file ? URL.createObjectURL(file) : null;
    const previewResourceUrl = nextUrl && this.isPdf(file) ? `${nextUrl}${PDF_VIEWER_OPTIONS}` : nextUrl;
    this.objectUrl = nextUrl;
    this.previewUrl.set(nextUrl);
    this.previewResourceUrl.set(previewResourceUrl ? this.sanitizer.bypassSecurityTrustResourceUrl(previewResourceUrl) : null);
    this.errorMessage.set('');
  }

  goBackToStart(): void {
    this.revokePreviewUrl();
    this.selectedFile.set(null);
    this.previewUrl.set(null);
    this.previewResourceUrl.set(null);
    this.result.set(null);
    this.errorMessage.set('');
    this.working.set(false);
    this.submitting.set(false);
    this.hasManualEdits.set(false);
  }

  extractForReview(): void {
    const file = this.selectedFile();
    if (!file) {
      this.errorMessage.set('Select an invoice file first.');
      return;
    }

    this.working.set(true);
    this.errorMessage.set('');
    this.result.set(null);

    this.invoiceApi.extractForReview(file).subscribe({
      next: (result) => {
        if (this.partners().length === 0) {
          this.loadPartners();
        }
        this.result.set(this.reconcileProcessingResult(result));
        this.hasManualEdits.set(false);
        this.working.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(this.readError(error));
        this.working.set(false);
      },
    });
  }

  submitReviewed(): void {
    const result = this.result();
    if (!result) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set('');

    this.invoiceApi.registerReviewed(result).subscribe({
      next: (result) => {
        this.result.set(this.reconcileProcessingResult(result));
        this.hasManualEdits.set(false);
        this.submitting.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(this.readError(error));
        this.submitting.set(false);
      },
    });
  }

  addLine(): void {
    const result = this.result();
    if (!result) {
      return;
    }

    this.result.set({
      ...result,
      extracted_invoice: {
        ...result.extracted_invoice,
        lines: [...result.extracted_invoice.lines, this.newLine()],
      },
    });
    this.hasManualEdits.set(true);
  }

  removeLine(index: number): void {
    const result = this.result();
    if (!result) {
      return;
    }

    this.result.set({
      ...result,
      extracted_invoice: {
        ...result.extracted_invoice,
        lines: result.extracted_invoice.lines.filter((_, lineIndex) => lineIndex !== index),
      },
    });
    this.hasManualEdits.set(true);
    this.recalculateTotals();
  }

  updateInvoiceField(change: InvoiceFieldChange): void {
    const result = this.result();
    if (!result) {
      return;
    }

    this.result.set({
      ...result,
      extracted_invoice: {
        ...result.extracted_invoice,
        [change.field]: change.value,
      },
    });
    this.hasManualEdits.set(true);
  }

  updateLineField(change: LineFieldChange): void {
    const result = this.result();
    if (!result) {
      return;
    }

    const lines = result.extracted_invoice.lines.map((line, index) => {
      if (index !== change.index) {
        return line;
      }

      return this.applyLineChange(line, change);
    });

    this.result.set(this.withRecalculatedTotals(result, lines));
    this.hasManualEdits.set(true);
  }

  updatePartnerCode(partnerCode: string | null): void {
    const result = this.result();
    if (!result) {
      return;
    }

    this.result.set({
      ...result,
      partner_code: partnerCode,
    });
    this.hasManualEdits.set(true);
  }

  approveReviewedEdits(): void {
    const result = this.result();
    if (!result) {
      return;
    }

    this.result.set({
      ...result,
      status: 'ready',
      validation_errors: [],
      warnings: [],
      extracted_invoice: {
        ...result.extracted_invoice,
        warnings: [],
      },
    });
    this.hasManualEdits.set(false);
  }

  recalculateTotals(): void {
    const result = this.result();
    if (!result) {
      return;
    }

    this.result.set(this.withRecalculatedTotals(result, result.extracted_invoice.lines));
    this.hasManualEdits.set(true);
  }

  private applyLineChange(line: InvoiceLine, change: LineFieldChange): InvoiceLine {
    const updated = {
      ...line,
      [change.field]: change.value,
    };

    if (change.field === 'quantity' || change.field === 'unit_price') {
      if (updated.quantity !== null && updated.quantity !== undefined && updated.unit_price !== null && updated.unit_price !== undefined) {
        const quantity = Number(updated.quantity);
        const unitPrice = Number(updated.unit_price);
        const amount = Math.round(quantity * unitPrice);
        updated.amount = this.isDiscountLine(updated.description) ? -Math.abs(amount) : amount;
      }
    }

    return updated;
  }

  private withRecalculatedTotals(result: ProcessingResult, lines: InvoiceLine[]): ProcessingResult {
    const subtotal = lines.reduce((total, line) => total + Number(line.amount || 0), 0);
    const subtotalByCode = lines.reduce<Record<string, number>>((totals, line) => {
      totals[line.tax_code] = (totals[line.tax_code] ?? 0) + Number(line.amount || 0);
      return totals;
    }, {});
    const taxAmount = Object.entries(subtotalByCode).reduce((total, [code, amount]) => {
      const rate = TAX_RATES[code] ?? 0;
      return total + Math.floor(amount * rate);
    }, 0);

    return {
      ...result,
      extracted_invoice: {
        ...result.extracted_invoice,
        lines,
        subtotal,
        tax_amount: taxAmount,
        total_amount: subtotal + taxAmount,
      },
    };
  }

  private reconcileProcessingResult(result: ProcessingResult): ProcessingResult {
    const invoice = result.extracted_invoice;
    if (!invoice) {
      return result;
    }

    const lines = invoice.lines.map((line) => ({ ...line }));
    let changed = false;

    for (const line of lines) {
      if (!this.isDiscountLine(line.description)) {
        continue;
      }

      const originalAmount = line.amount;
      if (line.quantity !== null && line.quantity !== undefined && line.unit_price !== null && line.unit_price !== undefined) {
        line.amount = -Math.abs(Math.round(Number(line.quantity) * Number(line.unit_price)));
      } else if (line.unit_price !== null && line.unit_price !== undefined && (line.quantity === null || line.quantity === undefined || line.quantity === 1)) {
        line.amount = -Math.abs(Number(line.unit_price));
      } else {
        line.amount = -Math.abs(Number(line.amount || 0));
      }
      changed = changed || line.amount !== originalAmount;
    }

    const trustedSubtotal = this.trustedSubtotal(result);
    if (trustedSubtotal !== null && this.sumLineAmounts(lines) !== trustedSubtotal) {
      changed = this.inferSingleRemainderLine(lines, trustedSubtotal) || changed;
    }

    if (!changed) {
      return result;
    }

    const warning = 'Line amounts were reconciled against invoice subtotal/tax/total rules.';
    return {
      ...result,
      validation_errors: result.validation_errors.filter((error) => !this.isAmountMismatchError(error)),
      warnings: result.warnings.includes(warning) ? result.warnings : [...result.warnings, warning],
      extracted_invoice: {
        ...invoice,
        lines,
        warnings: invoice.warnings.includes(warning) ? invoice.warnings : [...invoice.warnings, warning],
      },
    };
  }

  private trustedSubtotal(result: ProcessingResult): number | null {
    const invoice = result.extracted_invoice;
    if (invoice.subtotal + invoice.tax_amount !== invoice.total_amount) {
      return null;
    }

    const taxCodes = new Set(invoice.lines.map((line) => line.tax_code));
    if (taxCodes.size !== 1) {
      return null;
    }

    const taxCode = [...taxCodes][0];
    const taxRate = TAX_RATES[taxCode];
    if (taxRate === undefined) {
      return null;
    }

    return Math.floor(invoice.subtotal * taxRate) === invoice.tax_amount ? invoice.subtotal : null;
  }

  private inferSingleRemainderLine(lines: InvoiceLine[], subtotalTarget: number): boolean {
    const currentSum = this.sumLineAmounts(lines);

    for (const line of lines) {
      if (this.isDiscountLine(line.description)) {
        continue;
      }

      const remainder = subtotalTarget - (currentSum - line.amount);
      if (remainder === line.amount || !this.isPlausibleLineAmount(line, remainder)) {
        continue;
      }

      line.amount = remainder;
      if (line.unit_price && (line.quantity === null || line.quantity === undefined) && remainder % line.unit_price === 0) {
        const inferredQuantity = remainder / line.unit_price;
        if (inferredQuantity > 0) {
          line.quantity = inferredQuantity;
        }
      }
      return true;
    }

    return false;
  }

  private isPlausibleLineAmount(line: InvoiceLine, amount: number): boolean {
    if (amount <= 0) {
      return false;
    }
    if (line.quantity !== null && line.quantity !== undefined && line.unit_price !== null && line.unit_price !== undefined) {
      return amount === line.quantity * line.unit_price;
    }
    if (line.unit_price && line.unit_price > 0) {
      return amount % line.unit_price === 0;
    }
    if (line.amount > 0) {
      const ratio = amount / line.amount;
      return Number.isInteger(ratio) && ratio > 1 && ratio <= 100;
    }
    return false;
  }

  private isAmountMismatchError(error: string): boolean {
    return /subtotal mismatch|tax_amount mismatch|total_amount mismatch|Subtotal must equal|Tax amount must match|Total amount must equal/i.test(error);
  }

  private sumLineAmounts(lines: InvoiceLine[]): number {
    return lines.reduce((total, line) => total + Number(line.amount || 0), 0);
  }

  private newLine(): InvoiceLine {
    return {
      description: '',
      quantity: null,
      unit: '',
      unit_price: null,
      amount: 0,
      tax_code: 'T10',
    };
  }

  private readError(error: HttpErrorResponse): string {
    const payload = error.error as { error?: { message?: string }; detail?: string } | null;
    return payload?.error?.message ?? payload?.detail ?? error.message ?? 'Request failed.';
  }

  private revokePreviewUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  private isPdf(file: File | null): boolean {
    return Boolean(file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')));
  }

  private isDiscountLine(description: string): boolean {
    const normalized = description.toLowerCase();
    return DISCOUNT_KEYWORDS.some((keyword) => normalized.includes(keyword));
  }
}
