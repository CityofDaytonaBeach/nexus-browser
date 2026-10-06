(function () {
  const api = window.nexusBrowser;
  const tabsElement = document.getElementById('tabs');
  const address = document.getElementById('address');
  const back = document.getElementById('back');
  const forward = document.getElementById('forward');
  const reload = document.getElementById('reload');
  const loadLine = document.getElementById('loadLine');
  const agentToggle = document.getElementById('agentToggle');
  const agentLabel = document.getElementById('agentLabel');
  const responsiveToggle = document.getElementById('responsiveToggle');
  const responsiveBar = document.getElementById('responsiveBar');
  const screenPreset = document.getElementById('screenPreset');
  const screenWidth = document.getElementById('screenWidth');
  const screenHeight = document.getElementById('screenHeight');
  const screenScale = document.getElementById('screenScale');
  let customScreens = [];
  try {
    const saved = JSON.parse(localStorage.getItem('nexus-responsive-screens') || '[]');
    if (Array.isArray(saved)) customScreens = saved.filter((s) => Number.isInteger(s.width) && Number.isInteger(s.height) && s.width >= 240 && s.width <= 3840 && s.height >= 240 && s.height <= 3840).slice(0, 20);
  } catch {}
  function addCustomOption(size) {
    const option = document.createElement('option');
    option.value = `${size.width}x${size.height}`;
    option.textContent = `Saved · ${size.width} × ${size.height}`;
    screenPreset.insertBefore(option, screenPreset.lastElementChild);
  }
  customScreens.forEach(addCustomOption);
  let state = { tabs: [], activeTabId: '', agentVisible: true, maximized: false };

  function command(type, detail) {
    return api.command({ type, ...(detail || {}) });
  }

  function activeTab() {
    return state.tabs.find((tab) => tab.id === state.activeTabId);
  }

  function renderTabs() {
    tabsElement.replaceChildren();
    state.tabs.forEach((tab) => {
      const button = document.createElement('button');
      button.className = `browser-tab${tab.id === state.activeTabId ? ' active' : ''}${tab.loading ? ' loading' : ''}`;
      button.type = 'button';
      button.role = 'tab';
      button.setAttribute('aria-selected', String(tab.id === state.activeTabId));
      button.title = tab.title || tab.url || 'New tab';

      const favicon = document.createElement('span');
      favicon.className = 'tab-favicon';
      const title = document.createElement('span');
      title.className = 'tab-title';
      title.textContent = tab.title || 'New tab';
      const close = document.createElement('button');
      close.className = 'tab-close';
      close.type = 'button';
      close.textContent = '×';
      close.title = 'Close tab';
      close.setAttribute('aria-label', `Close ${tab.title || 'tab'}`);
      close.addEventListener('click', (event) => {
        event.stopPropagation();
        command('close-tab', { tabId: tab.id });
      });
      button.addEventListener('click', () => command('activate-tab', { tabId: tab.id }));
      button.append(favicon, title, close);
      tabsElement.appendChild(button);
    });
  }

  function render(nextState) {
    state = nextState || state;
    renderTabs();
    const tab = activeTab();
    if (document.activeElement !== address) address.value = tab?.url || '';
    back.disabled = !tab?.canGoBack;
    forward.disabled = !tab?.canGoForward;
    reload.textContent = tab?.loading ? '×' : '↻';
    reload.title = tab?.loading ? 'Stop loading' : 'Reload (Ctrl+R)';
    loadLine.classList.toggle('active', Boolean(tab?.loading));
    agentToggle.classList.toggle('active', state.agentVisible);
    agentLabel.classList.toggle('active', state.agentVisible);
    agentLabel.lastChild.textContent = state.agentVisible ? 'Agent live' : 'Agent hidden';
    document.getElementById('maximize').textContent = state.maximized ? '❐' : '□';
    const viewport = state.responsive || { enabled: false, width: 390, height: 844, scale: 1 };
    responsiveBar.hidden = !viewport.enabled;
    document.querySelector('.browser-chrome').classList.toggle('responsive', viewport.enabled);
    responsiveToggle.classList.toggle('active', viewport.enabled);
    responsiveToggle.setAttribute('aria-expanded', String(viewport.enabled));
    if (![screenWidth, screenHeight].includes(document.activeElement)) {
      screenWidth.value = viewport.width;
      screenHeight.value = viewport.height;
      const size = `${viewport.width}x${viewport.height}`;
      screenPreset.value = Array.from(screenPreset.options).some((option) => option.value === size) ? size : 'custom';
    }
    screenScale.textContent = `${viewport.width} × ${viewport.height} · ${Math.round(viewport.scale * 100)}% fit`;
  }

  async function applySize(save) {
    if (!responsiveBar.reportValidity()) return;
    const size = { width: Number(screenWidth.value), height: Number(screenHeight.value) };
    try {
      await command('responsive-size', size);
      if (save && !Array.from(screenPreset.options).some((option) => option.value === `${size.width}x${size.height}`)) {
        customScreens.unshift(size);
        customScreens = customScreens.slice(0, 20);
        localStorage.setItem('nexus-responsive-screens', JSON.stringify(customScreens));
        addCustomOption(size);
      }
      screenPreset.value = Array.from(screenPreset.options).some((option) => option.value === `${size.width}x${size.height}`) ? `${size.width}x${size.height}` : 'custom';
    } catch (error) { screenScale.textContent = error.message || 'Could not apply size'; }
  }
  responsiveToggle.addEventListener('click', () => command('responsive-toggle'));
  document.getElementById('exitResponsive').addEventListener('click', () => command('responsive-toggle'));
  responsiveBar.addEventListener('submit', (event) => { event.preventDefault(); void applySize(false); });
  document.getElementById('saveScreen').addEventListener('click', () => void applySize(true));
  document.getElementById('rotateScreen').addEventListener('click', () => {
    const width = screenWidth.value;
    screenWidth.value = screenHeight.value;
    screenHeight.value = width;
    void applySize(false);
  });
  screenPreset.addEventListener('change', () => {
    if (screenPreset.value === 'custom') { screenWidth.focus(); return; }
    const [width, height] = screenPreset.value.split('x');
    screenWidth.value = width; screenHeight.value = height;
    void applySize(false);
  });

  document.getElementById('newTab').addEventListener('click', () => command('new-tab'));
  back.addEventListener('click', () => command('back'));
  forward.addEventListener('click', () => command('forward'));
  reload.addEventListener('click', () => command(activeTab()?.loading ? 'stop' : 'reload'));
  document.getElementById('home').addEventListener('click', () => command('home'));
  agentToggle.addEventListener('click', () => command('toggle-agent'));
  agentLabel.addEventListener('click', () => command('toggle-agent'));
  document.getElementById('minimize').addEventListener('click', () => command('window-minimize'));
  document.getElementById('maximize').addEventListener('click', () => command('window-maximize'));
  document.getElementById('close').addEventListener('click', () => command('window-close'));
  address.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      command('navigate', { value: address.value });
      address.blur();
    }
  });
  address.addEventListener('focus', () => address.select());

  api.onState(render);
  api.onFocusAddress(() => {
    address.focus();
    address.select();
  });
  api.getState().then(render);
})();
