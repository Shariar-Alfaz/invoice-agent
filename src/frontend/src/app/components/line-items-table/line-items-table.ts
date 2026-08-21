import { CurrencyPipe } from '@angular/common';
import { Component, effect, inject, input, output, signal } from '@angular/core';
import { AbstractControl, FormArray, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { ClientValidationState, EditableLineField, InvoiceLine, LineFieldChange } from '../../models/invoice-review.models';

type LineFormGroup = FormGroup<{
  description: FormControl<string>;
  quantity: FormControl<number | null>;
  unit: FormControl<string>;
  unit_price: FormControl<number | null>;
  amount: FormControl<number>;
  tax_code: FormControl<string>;
}>;

const optionalIntegerValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value;
  return value === null || value === undefined || Number.isInteger(value) ? null : { integerAmount: true };
};

const requiredIntegerValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  return Number.isInteger(control.value) ? null : { integerAmount: true };
};

const lineAmountValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const quantity = control.get('quantity')?.value;
  const unitPrice = control.get('unit_price')?.value;
  const amount = control.get('amount')?.value;
  if (quantity === null || quantity === undefined || unitPrice === null || unitPrice === undefined) {
    return null;
  }

  return quantity * unitPrice === amount ? null : { lineAmountMismatch: true };
};

@Component({
  imports: [ButtonModule, ConfirmDialogModule, CurrencyPipe, InputNumberModule, InputTextModule, MessageModule, ReactiveFormsModule, SelectButtonModule, TableModule, TagModule],
  selector: 'app-line-items-table',
  templateUrl: './line-items-table.html',
})
export class LineItemsTable {
  private readonly confirmationService = inject(ConfirmationService);

  readonly lines = input<InvoiceLine[]>([]);

  readonly addLine = output<void>();
  readonly removeLine = output<number>();
  readonly lineFieldChange = output<LineFieldChange>();
  readonly validationStateChange = output<ClientValidationState>();

  readonly form = new FormArray<LineFormGroup>([]);
  readonly lineForms = signal<LineFormGroup[]>([]);
  readonly taxCodeOptions = [
    { label: 'T10', value: 'T10' },
    { label: 'T08', value: 'T08' },
  ];
  private subscriptions: Subscription[] = [];

  constructor() {
    effect(() => {
      this.syncLineForms(this.lines());
      this.emitValidationState();
    });
  }

  isLineInvalid(index: number, field: EditableLineField): boolean {
    const control = this.form.at(index)?.controls[field];
    return Boolean(control?.invalid && (control.dirty || control.touched));
  }

  hasLineAmountMismatch(index: number): boolean {
    const group = this.form.at(index);
    return Boolean(group?.hasError('lineAmountMismatch') && (group.dirty || group.touched));
  }

  errorMessage(index: number, field: EditableLineField): string {
    const control = this.form.at(index)?.controls[field];
    if (!control) {
      return 'Invalid value.';
    }
    if (control.hasError('required')) {
      return 'Required by accounting API.';
    }
    if (control.hasError('pattern')) {
      return 'Use T10 or T08.';
    }
    if (control.hasError('integerAmount')) {
      return 'Use a whole-yen integer or leave blank.';
    }
    if (control.hasError('min')) {
      return field === 'amount' ? 'Amount must be a whole-yen integer.' : 'Value must be zero or greater.';
    }
    return 'Invalid value.';
  }

  markAllTouched(): void {
    this.form.markAllAsTouched();
    this.emitValidationState();
  }

  confirmRemoveLine(event: Event, index: number): void {
    const description = this.form.at(index)?.controls.description.value || 'this line item';
    this.confirmationService.confirm({
      key: 'line-item-delete',
      target: event.currentTarget ?? undefined,
      header: 'Delete line item?',
      message: `Remove "${description}" from this invoice? Totals will be recalculated.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptIcon: 'pi pi-trash',
      rejectIcon: 'pi pi-times',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      defaultFocus: 'reject',
      accept: () => this.removeLine.emit(index),
    });
  }

  private syncLineForms(lines: InvoiceLine[]): void {
    if (this.form.length !== lines.length) {
      this.rebuildLineForms(lines);
      return;
    }

    lines.forEach((line, index) => {
      this.form.at(index).patchValue(line, { emitEvent: false });
    });
    this.lineForms.set([...this.form.controls]);
  }

  private rebuildLineForms(lines: InvoiceLine[]): void {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
    this.subscriptions = [];
    this.form.clear({ emitEvent: false });

    lines.forEach((line, index) => {
      const group = this.createLineGroup(line);
      this.form.push(group, { emitEvent: false });

      this.subscribeToLineControl(group, index, 'description');
      this.subscribeToLineControl(group, index, 'quantity');
      this.subscribeToLineControl(group, index, 'unit');
      this.subscribeToLineControl(group, index, 'unit_price');
      this.subscribeToLineControl(group, index, 'amount');
      this.subscribeToLineControl(group, index, 'tax_code');
      this.subscriptions.push(group.statusChanges.subscribe(() => this.emitValidationState()));
    });
    this.lineForms.set([...this.form.controls]);
  }

  private subscribeToLineControl(group: LineFormGroup, index: number, field: EditableLineField): void {
    switch (field) {
      case 'description':
        this.subscriptions.push(group.controls.description.valueChanges.subscribe((value) => this.emitLineChange(index, field, value)));
        break;
      case 'quantity':
        this.subscriptions.push(group.controls.quantity.valueChanges.subscribe((value) => this.emitLineChange(index, field, value)));
        break;
      case 'unit':
        this.subscriptions.push(group.controls.unit.valueChanges.subscribe((value) => this.emitLineChange(index, field, value)));
        break;
      case 'unit_price':
        this.subscriptions.push(group.controls.unit_price.valueChanges.subscribe((value) => this.emitLineChange(index, field, value)));
        break;
      case 'amount':
        this.subscriptions.push(group.controls.amount.valueChanges.subscribe((value) => this.emitLineChange(index, field, value)));
        break;
      case 'tax_code':
        this.subscriptions.push(group.controls.tax_code.valueChanges.subscribe((value) => this.emitLineChange(index, field, value)));
        break;
    }
  }

  private emitLineChange(index: number, field: EditableLineField, value: LineFieldChange['value']): void {
    this.lineFieldChange.emit({ index, field, value } as LineFieldChange);
    this.emitValidationState();
  }

  private createLineGroup(line: InvoiceLine): LineFormGroup {
    return new FormGroup(
      {
        description: new FormControl(line.description, { nonNullable: true, validators: [Validators.required] }),
        quantity: new FormControl<number | null>(line.quantity, [optionalIntegerValidator, Validators.min(0)]),
        unit: new FormControl(line.unit, { nonNullable: true, validators: [Validators.required] }),
        unit_price: new FormControl<number | null>(line.unit_price, [optionalIntegerValidator, Validators.min(0)]),
        amount: new FormControl(line.amount, { nonNullable: true, validators: [Validators.required, requiredIntegerValidator] }),
        tax_code: new FormControl(line.tax_code, { nonNullable: true, validators: [Validators.required, Validators.pattern(/^(T10|T08)$/)] }),
      },
      { validators: [lineAmountValidator] },
    );
  }

  private emitValidationState(): void {
    const errors = this.collectErrors();
    this.validationStateChange.emit({
      invalid: errors.length > 0,
      errors,
    });
  }

  private collectErrors(): string[] {
    if (this.form.length === 0) {
      return ['Invoice must contain at least one line'];
    }

    return this.form.controls.flatMap((group, index) => {
      const errors: string[] = [];
      if (group.controls.description.invalid) {
        errors.push(`lines[${index}].description is required`);
      }
      if (group.controls.unit.invalid) {
        errors.push(`lines[${index}].unit is required`);
      }
      if (group.controls.amount.invalid) {
        errors.push(`lines[${index}].amount must be an integer amount in JPY`);
      }
      if (group.controls.quantity.invalid) {
        errors.push(`lines[${index}].quantity must be an integer or null`);
      }
      if (group.controls.unit_price.invalid) {
        errors.push(`lines[${index}].unit_price must be an integer or null`);
      }
      if (group.controls.tax_code.invalid) {
        errors.push(`lines[${index}].tax_code must be T10 or T08`);
      }
      if (group.hasError('lineAmountMismatch')) {
        errors.push(`lines[${index}] amount must equal quantity x unit price`);
      }
      return errors;
    });
  }
}
