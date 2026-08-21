import { Component, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';

@Component({
  imports: [ButtonModule],
  selector: 'app-source-file-panel',
  templateUrl: './source-file-panel.html',
})
export class SourceFilePanel {
  readonly selectedFile = input<File | null>(null);
  readonly working = input(false);
  readonly errorMessage = input('');

  readonly fileSelected = output<File | null>();
  readonly extract = output<void>();

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.fileSelected.emit(input.files?.item(0) ?? null);
  }
}
