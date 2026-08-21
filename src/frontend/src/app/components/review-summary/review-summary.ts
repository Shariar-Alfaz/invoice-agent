import { Component, computed, input } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { TagModule } from 'primeng/tag';

import { ProcessingResult } from '../../models/invoice-review.models';

@Component({
  imports: [CurrencyPipe, TagModule],
  selector: 'app-review-summary',
  templateUrl: './review-summary.html',
})
export class ReviewSummary {
  readonly result = input.required<ProcessingResult>();
  readonly hasAccountingResponse = computed(() => Boolean(this.result().accounting_response));
}
