import { JsonPipe } from '@angular/common';
import { Component, input } from '@angular/core';

import { OcrResult } from '../../models/invoice-review.models';

@Component({
  imports: [JsonPipe],
  selector: 'app-evidence-panels',
  templateUrl: './evidence-panels.html',
})
export class EvidencePanels {
  readonly ocr = input.required<OcrResult>();
  readonly accountingResponse = input<unknown>(null);
}
