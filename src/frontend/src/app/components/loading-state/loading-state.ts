import { Component } from '@angular/core';

@Component({
  selector: 'app-loading-state',
  template: `
    <div class="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
      <i class="pi pi-spin pi-spinner text-4xl text-sky-600"></i>
      <h2 class="mt-4 text-lg font-semibold text-slate-950">Extracting invoice data</h2>
      <p class="mt-2 text-sm text-slate-600">OCR and LLM extraction are running.</p>
    </div>
  `,
})
export class LoadingState {}
