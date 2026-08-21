import { Component, effect, input, signal } from '@angular/core';
import { SafeResourceUrl } from '@angular/platform-browser';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { ImageModule } from 'primeng/image';

import { OcrResult } from '../../models/invoice-review.models';

@Component({
  imports: [ButtonModule, DialogModule, ImageModule],
  selector: 'app-document-preview',
  templateUrl: './document-preview.html',
})
export class DocumentPreview {
  readonly file = input<File | null>(null);
  readonly ocr = input<OcrResult | null>(null);
  readonly previewType = input<'image' | 'pdf' | 'unsupported' | 'empty'>('empty');
  readonly previewUrl = input<string | null>(null);
  readonly previewResourceUrl = input<SafeResourceUrl | null>(null);
  readonly pdfPreviewOpen = signal(false);
  readonly animatedOcrText = signal('');

  constructor() {
    effect((onCleanup) => {
      const text = this.ocr()?.text?.trim() ?? '';
      this.animatedOcrText.set('');

      if (!text) {
        return;
      }

      let index = 0;
      const chunkSize = Math.max(1, Math.ceil(text.length / 500));
      const timer = window.setInterval(() => {
        index = Math.min(text.length, index + chunkSize);
        this.animatedOcrText.set(text.slice(0, index));

        if (index >= text.length) {
          window.clearInterval(timer);
        }
      }, 12);

      onCleanup(() => window.clearInterval(timer));
    });
  }
}
