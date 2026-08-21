import { Component, computed, effect, input, output } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';

import { ClientValidationState, EditableInvoiceField, ExtractedInvoice, InvoiceFieldChange, PartnerOption } from '../../models/invoice-review.models';

interface PartnerSelectOption {
  code: string | null;
  label: string;
}

const TAX_RATES: Record<string, number> = {
  T08: 0.08,
  T10: 0.1,
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const integerAmountValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value;
  return Number.isInteger(value) ? null : { integerAmount: true };
};

const isoDateValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value;
  if (!value) {
    return null;
  }
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
    return { isoDate: true };
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? { isoDate: true } : null;
};

const dateOrderValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const issueDate = control.get('issue_date')?.value;
  const dueDate = control.get('due_date')?.value;
  if (!issueDate || !dueDate) {
    return null;
  }
  if (typeof issueDate !== 'string' || typeof dueDate !== 'string' || !ISO_DATE_PATTERN.test(issueDate) || !ISO_DATE_PATTERN.test(dueDate)) {
    return null;
  }

  return dueDate < issueDate ? { dateOrder: true } : null;
};

@Component({
  imports: [ButtonModule, DatePickerModule, InputNumberModule, MessageModule, ReactiveFormsModule, SelectModule],
  selector: 'app-invoice-fields',
  templateUrl: './invoice-fields.html',
})
export class InvoiceFields {
  readonly invoice = input.required<ExtractedInvoice>();
  readonly partnerCode = input<string | null>(null);
  readonly partners = input<PartnerOption[]>([]);

  readonly invoiceFieldChange = output<InvoiceFieldChange>();
  readonly partnerCodeChange = output<string | null>();
  readonly refreshPartners = output<void>();
  readonly recalculate = output<void>();
  readonly validationStateChange = output<ClientValidationState>();
  readonly partnerOptions = computed<PartnerSelectOption[]>(() => [
    { code: null, label: 'Select supplier from accounting master' },
    ...this.partners().map((partner) => ({ code: partner.partner_code, label: `${partner.partner_code} - ${partner.name}` })),
  ]);

  readonly form = new FormGroup(
    {
      supplier_name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      supplier_registration_number: new FormControl<string | null>(null, [Validators.pattern(/^T?\d{13}$/)]),
      invoice_number: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      issue_date: new FormControl('', { nonNullable: true, validators: [Validators.required, isoDateValidator] }),
      due_date: new FormControl<string | null>(null, [Validators.required, isoDateValidator]),
      currency: new FormControl('JPY', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^JPY$/)] }),
      partner_code: new FormControl<string | null>(null, [Validators.required]),
      subtotal: new FormControl(0, { nonNullable: true, validators: [Validators.required, integerAmountValidator, Validators.min(0)] }),
      tax_amount: new FormControl(0, { nonNullable: true, validators: [Validators.required, integerAmountValidator, Validators.min(0)] }),
      total_amount: new FormControl(0, { nonNullable: true, validators: [Validators.required, integerAmountValidator, Validators.min(1)] }),
    },
    { validators: [dateOrderValidator] },
  );

  constructor() {
    effect(() => {
      const invoice = this.invoice();
      this.form.patchValue(
        {
          supplier_name: invoice.supplier_name,
          supplier_registration_number: invoice.supplier_registration_number,
          invoice_number: invoice.invoice_number,
          issue_date: invoice.issue_date,
          due_date: invoice.due_date,
          currency: invoice.currency,
          partner_code: this.partnerCode(),
          subtotal: invoice.subtotal,
          tax_amount: invoice.tax_amount,
          total_amount: invoice.total_amount,
        },
        { emitEvent: false },
      );
      this.emitValidationState();
    });

    this.form.controls.supplier_name.valueChanges.subscribe((value) => this.updateField('supplier_name', value));
    this.form.controls.supplier_registration_number.valueChanges.subscribe((value) => this.updateField('supplier_registration_number', value));
    this.form.controls.invoice_number.valueChanges.subscribe((value) => this.updateField('invoice_number', value));
    this.form.controls.issue_date.valueChanges.subscribe((value) => this.updateField('issue_date', value));
    this.form.controls.due_date.valueChanges.subscribe((value) => this.updateField('due_date', value));
    this.form.controls.currency.valueChanges.subscribe((value) => this.updateField('currency', value));
    this.form.controls.subtotal.valueChanges.subscribe((value) => this.updateField('subtotal', value));
    this.form.controls.tax_amount.valueChanges.subscribe((value) => this.updateField('tax_amount', value));
    this.form.controls.total_amount.valueChanges.subscribe((value) => this.updateField('total_amount', value));
    this.form.controls.partner_code.valueChanges.subscribe((value) => {
      this.partnerCodeChange.emit(value);
      this.emitValidationState();
    });
    this.form.statusChanges.subscribe(() => this.emitValidationState());
  }

  updateField(field: EditableInvoiceField, value: ExtractedInvoice[EditableInvoiceField]): void {
    this.invoiceFieldChange.emit({ field, value });
    this.emitValidationState();
  }

  isInvalid(controlName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[controlName];
    const hasGroupError = controlName === 'due_date' && this.form.hasError('dateOrder');
    return (control.invalid || hasGroupError) && (control.dirty || control.touched);
  }

  markForRecalculate(): void {
    this.form.markAllAsTouched();
    this.emitValidationState();
    this.recalculate.emit();
  }

  errorMessage(controlName: keyof typeof this.form.controls): string {
    const control = this.form.controls[controlName];
    if (controlName === 'due_date' && this.form.hasError('dateOrder')) {
      return 'Due date must be on or after issue date.';
    }
    if (control.hasError('required')) {
      return controlName === 'partner_code' ? 'Accounting API requires a listed supplier.' : 'This field is required.';
    }
    if (control.hasError('pattern')) {
      return controlName === 'currency' ? 'Accounting API only accepts JPY.' : 'Use T plus 13 digits, or 13 digits.';
    }
    if (control.hasError('isoDate')) {
      return 'Use YYYY-MM-DD.';
    }
    if (control.hasError('integerAmount')) {
      return 'Accounting API requires whole-yen integer amounts.';
    }
    if (control.hasError('min')) {
      return 'Value must be zero or greater.';
    }
    return 'Invalid value.';
  }

  accountingRuleErrors(): string[] {
    const invoice = this.invoice();
    const subtotal = this.form.controls.subtotal.value;
    const taxAmount = this.form.controls.tax_amount.value;
    const totalAmount = this.form.controls.total_amount.value;

    if (subtotal + taxAmount !== totalAmount) {
      return [`Total amount must equal subtotal plus tax: expected ${subtotal + taxAmount}, received ${totalAmount}.`];
    }

    const expectedSubtotal = invoice.lines.reduce((total, line) => total + Number(line.amount || 0), 0);

    const subtotalByCode = invoice.lines.reduce<Record<string, number>>((totals, line) => {
      totals[line.tax_code] = (totals[line.tax_code] ?? 0) + Number(line.amount || 0);
      return totals;
    }, {});
    const expectedTax = Object.entries(subtotalByCode).reduce((total, [code, amount]) => {
      const rate = TAX_RATES[code];
      return rate === undefined ? total : total + Math.floor(amount * rate);
    }, 0);
    const expectedTotal = expectedSubtotal + expectedTax;

    const errors: string[] = [];
    if (subtotal !== expectedSubtotal) {
      errors.push(`Subtotal must equal line amounts: expected ${expectedSubtotal}, received ${subtotal}.`);
    }
    if (taxAmount !== expectedTax) {
      errors.push(`Tax amount must match accounting tax recalculation: expected ${expectedTax}, received ${taxAmount}.`);
    }
    if (totalAmount !== expectedTotal) {
      errors.push(`Total amount must equal subtotal plus tax: expected ${expectedTotal}, received ${totalAmount}.`);
    }
    return errors;
  }

  private emitValidationState(): void {
    const errors = this.collectErrors();
    this.validationStateChange.emit({
      invalid: errors.length > 0,
      errors,
    });
  }

  private collectErrors(): string[] {
    const labels: Partial<Record<keyof typeof this.form.controls, string>> = {
      supplier_name: 'Supplier name',
      supplier_registration_number: 'Registration number',
      invoice_number: 'Invoice number',
      issue_date: 'Issue date',
      due_date: 'Due date',
      currency: 'Currency',
      partner_code: 'Partner',
      subtotal: 'Subtotal',
      tax_amount: 'Tax amount',
      total_amount: 'Total amount',
    };

    const fieldErrors = Object.entries(this.form.controls)
      .filter(([, control]) => control.invalid)
      .map(([name]) => `${labels[name as keyof typeof this.form.controls] ?? name} is invalid`);

    const dateErrors = this.form.hasError('dateOrder') ? ['Due date must be on or after issue date'] : [];
    return [...fieldErrors, ...dateErrors, ...this.accountingRuleErrors()];
  }
}
