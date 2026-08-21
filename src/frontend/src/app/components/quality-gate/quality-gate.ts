import { Component, computed, input } from '@angular/core';
import { TagModule } from 'primeng/tag';

import { ProcessingResult, TagSeverity } from '../../models/invoice-review.models';

const LOW_CONFIDENCE_THRESHOLD = 0.85;

@Component({
  imports: [TagModule],
  selector: 'app-quality-gate',
  templateUrl: './quality-gate.html',
})
export class QualityGate {
  readonly result = input<ProcessingResult | null>(null);
  readonly invoiceConfidenceSeverity = computed<TagSeverity>(() => {
    const confidence = this.result()?.extracted_invoice.extraction_confidence ?? 0;
    if (confidence < 0.7) {
      return 'danger';
    }
    return confidence < LOW_CONFIDENCE_THRESHOLD ? 'warn' : 'success';
  });
  readonly ocrConfidenceSeverity = computed<TagSeverity>(() => {
    const confidence = this.result()?.ocr.confidence ?? 0;
    return confidence < 0.9 ? 'warn' : 'success';
  });
  readonly isLowConfidence = computed(() => {
    const invoiceConfidence = this.result()?.extracted_invoice.extraction_confidence ?? 0;
    return invoiceConfidence < LOW_CONFIDENCE_THRESHOLD;
  });

  confidencePercent(value: number | null | undefined): string {
    return `${Math.round((value ?? 0) * 100)}%`;
  }
}
