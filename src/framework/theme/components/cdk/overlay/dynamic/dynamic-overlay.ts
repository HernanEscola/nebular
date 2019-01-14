import { ComponentFactoryResolver, ComponentRef, Injectable, Type } from '@angular/core';
import { takeUntil, takeWhile } from 'rxjs/operators';
import { Subject } from 'rxjs';

import {
  NbAdjustableConnectedPositionStrategy,
  NbPosition,
} from '../overlay-position';

import { NbRenderableContainer } from '../overlay-container';
import { createContainer, NbOverlayContent, NbOverlayService, patch } from '../overlay';
import { NbOverlayRef } from '../mapping';

export interface NbDynamicOverlayController {
  show();
  hide();
  toggle();
  rebuild();
}

@Injectable()
export class NbDynamicOverlay {

  protected ref: NbOverlayRef;
  protected container: ComponentRef<NbRenderableContainer>;
  protected componentFactoryResolver: ComponentFactoryResolver;
  protected componentType: Type<NbRenderableContainer>;
  protected context: Object = {};
  protected content: NbOverlayContent;
  protected positionStrategy: NbAdjustableConnectedPositionStrategy;

  protected positionStrategyChange$ = new Subject();
  protected alive = true;

  get isAttached(): boolean {
    return this.ref && this.ref.hasAttached();
  }

  constructor(private overlay: NbOverlayService) {
  }

  create(componentType: Type<NbRenderableContainer>,
         componentFactoryResolver: ComponentFactoryResolver,
         content: NbOverlayContent,
         context: Object,
         positionStrategy: NbAdjustableConnectedPositionStrategy) {

    this.setContext(context);
    this.setContent(content);
    this.setComponent(componentType, componentFactoryResolver);
    this.setPositionStrategy(positionStrategy);

    return this;
  }

  setContent(content: NbOverlayContent) {
    this.content = content;

    if (this.container) {
      this.updateContext();
    }
  }

  setContext(context: Object) {
    this.context = context;

    if (this.container) {
      this.updateContext();
    }
  }

  setComponent(componentType: Type<NbRenderableContainer>, componentFactoryResolver: ComponentFactoryResolver) {
    this.componentType = componentType;
    this.componentFactoryResolver = componentFactoryResolver;

    // in case the component is shown we recreate it and show it back
    if (this.ref && this.isAttached) {
      this.dispose();
      this.show();
    } else if (this.ref && !this.isAttached) {
      this.dispose();
    }
  }

  setPositionStrategy(positionStrategy: NbAdjustableConnectedPositionStrategy) {
    this.positionStrategyChange$.next();

    this.positionStrategy = positionStrategy;

    this.positionStrategy.positionChange
      .pipe(
        takeWhile(() => this.alive),
        takeUntil(this.positionStrategyChange$),
      )
      .subscribe((position: NbPosition) => patch(this.container, { position }));

    if (this.ref) {
      this.ref.updatePositionStrategy(this.positionStrategy);
    }
  }

  show() {
    if (!this.ref) {
      this.createOverlay();
    }

    this.renderContainer();
  }

  hide() {
    if (!this.ref) {
      return;
    }

    this.ref.detach();
    this.container = null;
  }

  toggle() {
    if (this.isAttached) {
      this.hide();
    } else {
      this.show();
    }
  }

  dispose() {
    this.alive = false;
    this.hide();
    if (this.ref) {
      this.ref.dispose();
      this.ref = null;
    }
  }

  getContainer() {
    return this.container;
  }

  protected createOverlay() {
    this.ref = this.overlay.create({
      positionStrategy: this.positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
    });
  }

  protected renderContainer() {
    const containerContext = this.createContainerContext();
    this.container = createContainer(this.ref, this.componentType, containerContext, this.componentFactoryResolver);
    this.container.instance.renderContent();
  }

  protected updateContext() {
    const containerContext = this.createContainerContext();
    Object.assign(this.container.instance, containerContext);
    this.container.instance.renderContent();
    this.container.changeDetectorRef.detectChanges();

    /**
     * Dimensions of the container may be changed after updating the content, so, we have to update
     * container position.
     * */
    this.ref.updatePosition();
  }

  protected createContainerContext(): Object {
    return {
      content: this.content,
      context: this.context,
      cfr: this.componentFactoryResolver,
    };
  }
}