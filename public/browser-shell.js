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
  }

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
