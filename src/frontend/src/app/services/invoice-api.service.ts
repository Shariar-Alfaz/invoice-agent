import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../../environments/primeui-license.generated';
import { ProcessingResult, PartnerOption, RegisteredInvoiceOption, TaxCodeOption } from '../models/invoice-review.models';

@Injectable({ providedIn: 'root' })
export class InvoiceApiService {
  private readonly http = inject(HttpClient);

  extractForReview(file: File): Observable<ProcessingResult> {
    const payload = new FormData();
    payload.append('file', file);
    return this.http.post<ProcessingResult>(`${API_BASE_URL}/api/invoices/process?register=false`, payload);
  }

  registerReviewed(result: ProcessingResult): Observable<ProcessingResult> {
    return this.http.post<ProcessingResult>(`${API_BASE_URL}/api/invoices/register-reviewed`, {
      source_file: result.source_file,
      extracted_invoice: result.extracted_invoice,
      partner_code: result.partner_code,
    });
  }

  listPartners(): Observable<PartnerOption[]> {
    return this.http.get<PartnerOption[]>(`${API_BASE_URL}/api/invoices/partners`);
  }

  listTaxCodes(): Observable<TaxCodeOption[]> {
    return this.http.get<TaxCodeOption[]>(`${API_BASE_URL}/api/invoices/tax-codes`);
  }

  listRegisteredInvoices(): Observable<RegisteredInvoiceOption[]> {
    return this.http.get<RegisteredInvoiceOption[]>(`${API_BASE_URL}/api/invoices/registered`);
  }

  clearRegisteredInvoices(): Observable<{ removed: number }> {
    return this.http.delete<{ removed: number }>(`${API_BASE_URL}/api/invoices/registered`);
  }
}
