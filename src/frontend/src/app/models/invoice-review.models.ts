export type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

export interface InvoiceLine {
  description: string;
  quantity: number | null;
  unit: string;
  unit_price: number | null;
  amount: number;
  tax_code: string;
}

export interface ExtractedInvoice {
  supplier_name: string;
  supplier_registration_number: string | null;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  currency: string;
  lines: InvoiceLine[];
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  extraction_confidence: number;
  warnings: string[];
}

export interface OcrResult {
  text: string;
  engine: string;
  confidence: number;
  warnings: string[];
}

export interface ProcessingResult {
  status: string;
  source_file: string;
  ocr: OcrResult;
  extracted_invoice: ExtractedInvoice;
  partner_code: string | null;
  validation_errors: string[];
  warnings: string[];
  accounting_response: unknown;
}

export interface PartnerOption {
  partner_code: string;
  name: string;
  aliases?: string[];
  registration_no?: string | null;
}

export interface TaxCodeOption {
  tax_code: string;
  rate: number;
  label: string;
}

export interface RegisteredInvoiceOption {
  accounting_id: string;
  partner_code: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  line_count: number;
}

export type EditableInvoiceField =
  | 'supplier_name'
  | 'supplier_registration_number'
  | 'invoice_number'
  | 'issue_date'
  | 'due_date'
  | 'currency'
  | 'subtotal'
  | 'tax_amount'
  | 'total_amount';

export type EditableLineField = keyof InvoiceLine;

export interface InvoiceFieldChange {
  field: EditableInvoiceField;
  value: ExtractedInvoice[EditableInvoiceField];
}

export interface LineFieldChange {
  index: number;
  field: EditableLineField;
  value: InvoiceLine[EditableLineField];
}

export interface ClientValidationState {
  invalid: boolean;
  errors: string[];
}
