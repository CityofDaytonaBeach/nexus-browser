// Copyright 2026 The Nexus Browser Authors
// Use of this source code is governed by the license in the Nexus repository.

import * as Host from '../../core/host/host.js';
import * as i18n from '../../core/i18n/i18n.js';
import * as SDK from '../../core/sdk/sdk.js';
import * as UIHelpers from '../../ui/helpers/helpers.js';
import * as UI from '../../ui/legacy/legacy.js';
import {html, render} from '../../ui/lit/lit.js';

import nexusPanelStyles from './nexusPanel.css.js';

const UIStrings = {
  /** @description Heading for the Nexus DevTools panel. */
  browserAgent: 'Browser agent',
  /** @description Label for a connected Nexus backend. */
  connected: 'Connected',
  /** @description Label shown while checking the Nexus backend. */
  checking: 'Checking',
  /** @description Label for an unavailable Nexus backend. */
  offline: 'Offline',
  /** @description Button that checks the Nexus backend again. */
  refresh: 'Refresh',
  /** @description Button that opens the Nexus browser workspace. */
  openNexus: 'Open Nexus',
  /** @description Heading for the inspected browser target. */
  inspectedTarget: 'Inspected target',
  /** @description Button that reads context from the inspected browser target. */
  captureContext: 'Capture context',
  /** @description Button that copies captured browser context as JSON. */
  copyJson: 'Copy JSON',
  /** @description Text shown when no inspected browser target exists. */
  noTarget: 'No page target is attached.',
  /** @description Heading for structured context captured from a browser target. */
  capturedContext: 'Captured context',
  /** @description Text shown before browser context has been captured. */
  capturePrompt: 'Capture the current target to inspect live DevTools model data.',
  /** @description Label for the URL of the inspected page. */
  url: 'URL',
  /** @description Label for the type of the inspected target. */
  type: 'Type',
} as const;

const str_ = i18n.i18n.registerUIStrings('panels/nexus/NexusPanel.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

type ConnectionState = 'checking'|'connected'|'offline';

interface CapturedTargetContext {
  capturedAt: string;
  target: {
    id: string;
    name: string;
    type: string;
    url: string;
    modelCount: number;
    models: string[];
    executionContexts: number;
  };
  document: {
    url: string;
    childNodeCount: number;
    outerHTMLBytes: number;
  }|null;
  attachedTargets: Array<{
    id: string;
    name: string;
    type: string;
    url: string;
  }>;
}

export class NexusPanel extends UI.Panel.Panel implements SDK.TargetManager.Observer {
  readonly #backendUrl = 'http://127.0.0.1:3207';
  #connectionState: ConnectionState = 'checking';
  #connectionDetails = '';
  #capturedContext?: CapturedTargetContext;
  #captureError = '';

  constructor() {
    super('nexus');
    this.registerRequiredCSS(nexusPanelStyles);
    SDK.TargetManager.TargetManager.instance().observeTargets(this);
    this.#render();
    void this.#refreshHealth();
  }

  targetAdded(_target: SDK.Target.Target): void {
    this.#render();
  }

  targetRemoved(_target: SDK.Target.Target): void {
    this.#render();
  }

  async #refreshHealth(): Promise<void> {
    this.#connectionState = 'checking';
    this.#connectionDetails = '';
    this.#render();

    try {
      const response = await fetch(`${this.#backendUrl}/health`, {cache: 'no-store'});
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json() as {name?: unknown, version?: unknown, sessions?: unknown};
      const name = typeof payload.name === 'string' ? payload.name : 'NexusBrowser';
      const version = typeof payload.version === 'string' ? ` v${payload.version}` : '';
      const sessions = typeof payload.sessions === 'number' ? ` | ${payload.sessions} sessions` : '';
      this.#connectionState = 'connected';
      this.#connectionDetails = `${name}${version}${sessions}`;
    } catch (error) {
      this.#connectionState = 'offline';
      this.#connectionDetails = error instanceof Error ? error.message : String(error);
    }
    this.#render();
  }

  async #captureTargetContext(): Promise<void> {
    const targetManager = SDK.TargetManager.TargetManager.instance();
    const target = targetManager.primaryPageTarget();
    if (!target) {
      this.#captureError = i18nString(UIStrings.noTarget);
      this.#capturedContext = undefined;
      this.#render();
      return;
    }

    try {
      const domModel = target.model(SDK.DOMModel.DOMModel);
      const document = await domModel?.requestDocument() ?? null;
      const outerHTML = await document?.getOuterHTML(true) ?? '';
      const runtimeModel = target.model(SDK.RuntimeModel.RuntimeModel);
      const models = [...target.models().keys()].map(model => model.name).sort();

      this.#capturedContext = {
        capturedAt: new Date().toISOString(),
        target: {
          id: String(target.id()),
          name: target.name(),
          type: String(target.type()),
          url: String(target.inspectedURL()),
          modelCount: models.length,
          models,
          executionContexts: runtimeModel?.executionContexts().length ?? 0,
        },
        document: document ? {
          url: document.documentURL,
          childNodeCount: document.childNodeCount(),
          outerHTMLBytes: new TextEncoder().encode(outerHTML).byteLength,
        } : null,
        attachedTargets: targetManager.targets().map(attachedTarget => ({
          id: String(attachedTarget.id()),
          name: attachedTarget.name(),
          type: String(attachedTarget.type()),
          url: String(attachedTarget.inspectedURL()),
        })),
      };
      this.#captureError = '';
    } catch (error) {
      this.#capturedContext = undefined;
      this.#captureError = error instanceof Error ? error.message : String(error);
    }
    this.#render();
  }

  #copyContext(): void {
    if (!this.#capturedContext) {
      return;
    }
    Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(
        JSON.stringify(this.#capturedContext, null, 2));
  }

  #openNexus(): void {
    UIHelpers.openInNewTab(this.#backendUrl);
  }

  #render(): void {
    const target = SDK.TargetManager.TargetManager.instance().primaryPageTarget();
    const statusLabel = this.#connectionState === 'connected' ? i18nString(UIStrings.connected) :
        this.#connectionState === 'offline'                       ? i18nString(UIStrings.offline) :
                                                                   i18nString(UIStrings.checking);

    render(html`
      <div class="nexus-panel">
        <header class="nexus-toolbar">
          <div>
            <h1>${i18nString(UIStrings.browserAgent)}</h1>
            <div class="connection-line">
              <span class="status-dot ${this.#connectionState}"></span>
              <span>${statusLabel}</span>
              ${this.#connectionDetails ? html`<span class="muted">${this.#connectionDetails}</span>` : ''}
            </div>
          </div>
          <div class="actions">
            <button @click=${this.#refreshHealth.bind(this)}>${i18nString(UIStrings.refresh)}</button>
            <button @click=${this.#openNexus.bind(this)}>${i18nString(UIStrings.openNexus)}</button>
          </div>
        </header>

        <section class="target-band">
          <div class="section-heading">
            <h2>${i18nString(UIStrings.inspectedTarget)}</h2>
            <button class="primary" ?disabled=${!target} @click=${this.#captureTargetContext.bind(this)}>
              ${i18nString(UIStrings.captureContext)}
            </button>
          </div>
          ${target ? html`
            <dl class="target-details">
              <dt>${i18nString(UIStrings.url)}</dt><dd>${String(target.inspectedURL())}</dd>
              <dt>${i18nString(UIStrings.type)}</dt><dd>${String(target.type())}</dd>
            </dl>
          ` : html`<p class="muted">${i18nString(UIStrings.noTarget)}</p>`}
        </section>

        <section class="context-band">
          <div class="section-heading">
            <h2>${i18nString(UIStrings.capturedContext)}</h2>
            <button ?disabled=${!this.#capturedContext} @click=${this.#copyContext.bind(this)}>
              ${i18nString(UIStrings.copyJson)}
            </button>
          </div>
          ${this.#captureError ? html`<p class="error">${this.#captureError}</p>` : ''}
          ${this.#capturedContext ? html`
            <pre>${JSON.stringify(this.#capturedContext, null, 2)}</pre>
          ` : html`<p class="muted">${i18nString(UIStrings.capturePrompt)}</p>`}
        </section>
      </div>
    `, this.contentElement);
  }
}
