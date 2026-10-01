// Copyright 2026 The Nexus Browser Authors
// Use of this source code is governed by the license in the Nexus repository.

import * as i18n from '../../core/i18n/i18n.js';
import * as UI from '../../ui/legacy/legacy.js';

import type * as Nexus from './nexus.js';

const UIStrings = {
  /**
   * @description Title of the Nexus browser agent panel.
   */
  nexus: 'Nexus',
  /**
   * @description Command for showing the Nexus browser agent panel.
   */
  showNexus: 'Show Nexus',
} as const;

const str_ = i18n.i18n.registerUIStrings('panels/nexus/nexus-meta.ts', UIStrings);
const i18nLazyString = i18n.i18n.getLazilyComputedLocalizedString.bind(undefined, str_);

let loadedNexusModule: (typeof Nexus|undefined);

async function loadNexusModule(): Promise<typeof Nexus> {
  if (!loadedNexusModule) {
    loadedNexusModule = await import('./nexus.js');
  }
  return loadedNexusModule;
}

UI.ViewManager.registerViewExtension({
  location: UI.ViewManager.ViewLocationValues.PANEL,
  id: 'nexus',
  commandPrompt: i18nLazyString(UIStrings.showNexus),
  title: i18nLazyString(UIStrings.nexus),
  order: 5,
  persistence: UI.ViewManager.ViewPersistence.PERMANENT,
  async loadView() {
    const Nexus = await loadNexusModule();
    return new Nexus.NexusPanel.NexusPanel();
  },
});
