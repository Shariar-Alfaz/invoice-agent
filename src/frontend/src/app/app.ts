import { Component, inject } from '@angular/core';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TagModule } from 'primeng/tag';

import { EmptyReviewState } from './components/empty-review-state/empty-review-state';
import { DocumentPreview } from './components/document-preview/document-preview';
import { LoadingState } from './components/loading-state/loading-state';
import { QualityGate } from './components/quality-gate/quality-gate';
import { ReviewDetail } from './components/review-detail/review-detail';
import { SourceFilePanel } from './components/source-file-panel/source-file-panel';
import { InvoiceReviewStore } from './services/invoice-review.store';

@Component({
  imports: [ButtonModule, ConfirmDialogModule, DocumentPreview, EmptyReviewState, LoadingState, QualityGate, ReviewDetail, SourceFilePanel, TagModule],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly confirmationService = inject(ConfirmationService);
  readonly store = inject(InvoiceReviewStore);

  ngOnInit(): void {
    this.store.loadPartners();
  }

  confirmBack(event: Event): void {
    if (!this.store.result() || this.store.hasAccountingResponse()) {
      this.store.goBackToStart();
      return;
    }

    this.confirmationService.confirm({
      key: 'back-with-unsubmitted-review',
      target: event.currentTarget ?? undefined,
      header: 'Leave this review?',
      message: 'This invoice has not been submitted to the accounting API. Going back will discard the current review.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Go back',
      rejectLabel: 'Stay here',
      acceptIcon: 'pi pi-arrow-left',
      rejectIcon: 'pi pi-times',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      defaultFocus: 'reject',
      accept: () => this.store.goBackToStart(),
    });
  }
}
