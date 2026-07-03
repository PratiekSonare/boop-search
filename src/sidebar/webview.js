(function () {
  const vscode = acquireVsCodeApi();

  let currentSearchMode = 'embeddings';
  let currentProvider = 'gemini';
  let autocompleteVisible = false;
  let selectedAutocompleteIndex = -1;
  let currentAutocompleteItems = [];
  let activeFilters = [];
  let rightShiftHeld = false;
  let autoSendTimer = null;

  const searchModeToggle = document.getElementById('searchModeToggle');
  const queryInput = document.getElementById('queryInput');
  const searchBtn = document.getElementById('searchBtn');
  const statusBar = document.getElementById('statusBar');
  const loadingBar = document.getElementById('loadingBar');
  const resultsSection = document.getElementById('resultsSection');
  const resultsList = document.getElementById('resultsList');
  const settingsToggle = document.getElementById('settingsToggle');
  const settingsPanel = document.getElementById('settingsPanel');
  const settingsIcon = document.getElementById('settingsChevron');
  const settingsCloseBtn = document.getElementById('settingsCloseBtn');
  const providerSelect = document.getElementById('providerSelect');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const saveProviderBtn = document.getElementById('saveProviderBtn');
  const rootPathInput = document.getElementById('rootPathInput');
  const maxResultsInput = document.getElementById('maxResultsInput');
  const setRootPathBtn = document.getElementById('setRootPathBtn');
  const rescanBtn = document.getElementById('rescanBtn');
  const scanProgress = document.getElementById('scanProgress');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const autocompleteDropdown = document.getElementById('autocompleteDropdown');
  const enableSymbolExtraction = document.getElementById('enableSymbolExtraction');
  const filterChips = document.getElementById('filterChips');
  const workspacePathValue = document.getElementById('workspacePathValue');
  const emptyState = document.getElementById('emptyState');
  const emptyStateCacheStatus = document.getElementById('emptyStateCacheStatus');
  const emptyStateSettingsLink = document.getElementById('emptyStateSettingsLink');
  const copyAllPathsBtn = document.getElementById('copyAllPathsBtn');
  const providerConfigSection = document.getElementById('providerConfigSection');
  const cacheIndicator = document.getElementById('cacheIndicator');
  const settingsStatus = document.getElementById('settingsStatus');

  const geminiModelGroup = document.getElementById('geminiModelGroup');
  const openaiModelGroup = document.getElementById('openaiModelGroup');
  const openrouterModelGroup = document.getElementById('openrouterModelGroup');
  const geminiModelSelect = document.getElementById('geminiModelSelect');
  const openaiModelSelect = document.getElementById('openaiModelSelect');
  const modelInput = document.getElementById('modelInput');

  const DEFAULT_MODELS = {
    gemini: 'gemini-3.5-flash',
    openai: 'gpt-5.5',
    openrouter: 'anthropic/claude-3-haiku',
  };

  document.addEventListener('keydown', (e) => {
    if (e.code === 'ShiftRight') rightShiftHeld = true;
  });

  document.addEventListener('keyup', (e) => {
    if (e.code === 'ShiftRight') {
      rightShiftHeld = false;
    }
  });

  searchModeToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;
    searchModeToggle.querySelectorAll('.toggle-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentSearchMode = btn.dataset.mode;
    providerConfigSection.classList.toggle('hidden', currentSearchMode !== 'llm');
  });

  providerSelect.addEventListener('change', () => {
    currentProvider = providerSelect.value;
    updateModelVisibility();
  });

  settingsToggle.addEventListener('click', () => {
    settingsPanel.classList.remove('hidden');
  });

  emptyStateSettingsLink.addEventListener('click', () => {
    settingsPanel.classList.remove('hidden');
  });

  settingsCloseBtn.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
  });

  settingsPanel.addEventListener('click', (e) => {
    if (e.target === settingsPanel) {
      settingsPanel.classList.add('hidden');
    }
  });

  searchBtn.addEventListener('click', () => {
    const freeText = queryInput.value.trim();
    const fullQuery = buildFullQuery(freeText);
    if (!fullQuery) {
      showStatus('Please enter a query.', 'warn');
      return;
    }
    vscode.postMessage({ type: 'search', query: fullQuery, searchMode: currentSearchMode });
  });

  queryInput.addEventListener('keydown', (e) => {
    if (autocompleteVisible) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedAutocompleteIndex = Math.min(
          selectedAutocompleteIndex + 1,
          currentAutocompleteItems.length - 1,
        );
        renderAutocomplete();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedAutocompleteIndex = Math.max(selectedAutocompleteIndex - 1, -1);
        renderAutocomplete();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        selectAutocompleteItem(Math.max(selectedAutocompleteIndex, 0));
        return;
      }
      if (e.key === 'Escape') {
        hideAutocomplete();
        return;
      }
    }

    if (e.key === 'Enter') {
      searchBtn.click();
    }
  });

  queryInput.addEventListener('input', () => {
    const value = queryInput.value;
    const cursorPos = queryInput.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);

    const atMatch = textBeforeCursor.match(/@(\w*):?\s*(.*)$/);
    if (atMatch) {
      const filterType = atMatch[1];
      const partial = atMatch[2];

      if (atMatch[0].includes(':') && partial.length >= 0) {
        vscode.postMessage({
          type: 'getFilterSuggestions',
          filterType,
          partial,
        });
      } else if (!atMatch[0].includes(':')) {
        vscode.postMessage({
          type: 'getFilterTypeSuggestions',
          partial: filterType,
        });
      }
    } else {
      hideAutocomplete();
    }

    if (rightShiftHeld && value.trim()) {
      if (autoSendTimer) clearTimeout(autoSendTimer);
      autoSendTimer = setTimeout(() => {
        if (queryInput.value.trim()) {
          searchBtn.click();
        }
      }, 1000);
    }
  });

  function buildFullQuery(freeText) {
    const filterParts = activeFilters.map((f) => `@${f.type}: "${f.value}"`);
    return [...filterParts, freeText].filter(Boolean).join(' ');
  }

  function addFilterChip(type, value) {
    activeFilters.push({ type, value });
    renderFilterChips();
  }

  function removeFilterChip(index) {
    activeFilters.splice(index, 1);
    renderFilterChips();
  }

  function renderFilterChips() {
    if (activeFilters.length === 0) {
      filterChips.classList.add('hidden');
      filterChips.innerHTML = '';
      return;
    }

    filterChips.classList.remove('hidden');
    filterChips.innerHTML = '';

    activeFilters.forEach((f, index) => {
      const chip = document.createElement('span');
      chip.className = 'filter-chip';
      chip.innerHTML = `@${escapeHtml(f.type)}: ${escapeHtml(f.value)} <span class="chip-remove" data-index="${index}">\u00d7</span>`;
      chip.querySelector('.chip-remove').addEventListener('click', () => removeFilterChip(index));
      filterChips.appendChild(chip);
    });
  }

  function selectAutocompleteItem(index) {
    const item = currentAutocompleteItems[index];
    if (!item) return;

    const value = queryInput.value;
    const cursorPos = queryInput.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);

    const atMatch = textBeforeCursor.match(/@(\w*):?\s*(.*)$/);
    if (!atMatch) return;

    const beforeAt = textBeforeCursor.substring(0, cursorPos - atMatch[0].length);

    if (item.type === 'filterType') {
      const insertText = `@${item.value}: `;
      queryInput.value = beforeAt + insertText + value.substring(cursorPos);
      queryInput.selectionStart = queryInput.selectionEnd = beforeAt.length + insertText.length;
      hideAutocomplete();
    } else {
      const filterType = atMatch[1];
      const chipValue = item.value;
      addFilterChip(filterType, chipValue);

      const afterCursor = value.substring(cursorPos);
      const remaining = (beforeAt + afterCursor).replace(/\s+/g, ' ').trim();
      queryInput.value = remaining;
      queryInput.selectionStart = queryInput.selectionEnd = remaining.length;
      hideAutocomplete();
    }

    queryInput.focus();
  }

  function showAutocomplete(items) {
    currentAutocompleteItems = items;
    selectedAutocompleteIndex = 0;
    autocompleteDropdown.innerHTML = '';

    items.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'autocomplete-item';
      if (index === 0) div.classList.add('selected');
      div.innerHTML =
        `<span class="filter-type">${escapeHtml(item.label)}</span>` +
        (item.description
          ? `<span class="filter-desc">${escapeHtml(item.description)}</span>`
          : '');
      div.addEventListener('click', () => selectAutocompleteItem(index));
      div.addEventListener('mouseenter', () => {
        selectedAutocompleteIndex = index;
        renderAutocomplete();
      });
      autocompleteDropdown.appendChild(div);
    });

    autocompleteVisible = true;
    autocompleteDropdown.classList.remove('hidden');
  }

  function hideAutocomplete() {
    autocompleteVisible = false;
    selectedAutocompleteIndex = -1;
    currentAutocompleteItems = [];
    autocompleteDropdown.classList.add('hidden');
  }

  function renderAutocomplete() {
    const items = autocompleteDropdown.querySelectorAll('.autocomplete-item');
    items.forEach((item, index) => {
      item.classList.toggle('selected', index === selectedAutocompleteIndex);
    });
  }

  saveProviderBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    let model;

    if (currentProvider === 'gemini') {
      model = geminiModelSelect.value;
    } else if (currentProvider === 'openai') {
      model = openaiModelSelect.value;
    } else {
      model = modelInput.value.trim() || DEFAULT_MODELS.openrouter;
    }

    if (!apiKey) {
      showStatus('API key is required.', 'warn');
      return;
    }

    vscode.postMessage({
      type: 'configureProvider',
      provider: currentProvider,
      apiKey,
      model,
    });
  });

  setRootPathBtn.addEventListener('click', () => {
    const rootPath = rootPathInput.value.trim();
    vscode.postMessage({ type: 'setRootPath', rootPath });
  });

  maxResultsInput.addEventListener('change', () => {
    const val = parseInt(maxResultsInput.value, 10);
    if (val >= 1 && val <= 50) {
      vscode.postMessage({ type: 'updateConfig', key: 'maxResultsShown', value: val });
    }
  });

  rescanBtn.addEventListener('click', () => {
    rescanBtn.disabled = true;
    rescanBtn.textContent = 'Scanning...';
    scanProgress.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressText.textContent = 'Starting...';
    vscode.postMessage({ type: 'rescan' });
  });

  enableSymbolExtraction.addEventListener('change', () => {
    vscode.postMessage({
      type: 'updateConfig',
      key: 'enableSymbolExtraction',
      value: enableSymbolExtraction.checked,
    });
  });

  vscode.postMessage({ type: 'getInitialState' });

  window.addEventListener('message', (event) => {
    const msg = event.data;

    switch (msg.type) {
      case 'initialState':
        handleInitialState(msg);
        break;
      case 'searching':
        showLoading(true, msg.message);
        break;
      case 'results':
        showLoading(false);
        showResults(msg.items, msg.query);
        break;
      case 'error':
        showLoading(false);
        scanProgress.classList.add('hidden');
        rescanBtn.disabled = false;
        rescanBtn.textContent = 'Rescan';
        resultsSection.classList.add('hidden');
        emptyState.classList.remove('hidden');
        showStatus(msg.message, 'error');
        break;
      case 'warning':
        showLoading(false);
        showStatus(msg.message, 'warn');
        break;
      case 'providerConfigured':
        showSettingsStatus(msg.message, 'ok');
        apiKeyInput.value = '';
        break;
      case 'scanProgress':
        if (msg.total > 0) {
          const pct = Math.round((msg.current / msg.total) * 100);
          progressBar.style.width = pct + '%';
          progressText.textContent = `${msg.current}/${msg.total} files (${pct}%)`;
        } else {
          progressBar.style.width = '10%';
          progressText.textContent = msg.message || 'Scanning...';
        }
        break;
      case 'rescanComplete':
        rescanBtn.disabled = false;
        rescanBtn.textContent = 'Rescan';
        scanProgress.classList.add('hidden');
        progressBar.style.width = '0%';
        showSettingsStatus(`Index rebuilt \u2014 ${msg.indexSize} files indexed.`, 'ok');
        emptyStateCacheStatus.textContent = `${msg.indexSize} files indexed. Start typing to search.`;
        emptyStateCacheStatus.classList.remove('hidden');
        cacheIndicator.classList.remove('hidden');
        break;
      case 'rootPathSet':
        showSettingsStatus(msg.message, 'ok');
        break;
      case 'filterSuggestions':
        hideAutocomplete();
        if (msg.items && msg.items.length > 0) {
          showAutocomplete(msg.items);
        }
        break;
    }
  });

  function handleInitialState(state) {
    currentProvider = state.currentProvider;
    currentSearchMode = state.searchMethod;

    if (state.workspacePath) {
      workspacePathValue.textContent = state.workspacePath;
    }

    if (state.hasCache) {
      cacheIndicator.classList.remove('hidden');
    }

    if (state.indexSize > 0) {
      emptyStateCacheStatus.textContent = `${state.indexSize} files indexed. Start typing to search.`;
      emptyStateCacheStatus.classList.remove('hidden');
    } else if (state.hasCache) {
      emptyStateCacheStatus.textContent = 'Cache found but empty. Click Rescan in settings.';
      emptyStateCacheStatus.classList.remove('hidden');
    }

    searchModeToggle.querySelectorAll('.toggle-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === currentSearchMode);
    });

    providerConfigSection.classList.toggle('hidden', currentSearchMode !== 'llm');

    providerSelect.value = currentProvider;
    updateModelVisibility();

    const providerInfo = state.providerStatus[currentProvider];
    if (providerInfo && providerInfo.configured) {
      apiKeyInput.placeholder = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (configured)';

      if (currentProvider === 'gemini') {
        const savedModel = providerInfo.model || DEFAULT_MODELS.gemini;
        geminiModelSelect.value = savedModel;
      } else if (currentProvider === 'openai') {
        const savedModel = providerInfo.model || DEFAULT_MODELS.openai;
        openaiModelSelect.value = savedModel;
      } else {
        modelInput.value = providerInfo.model || '';
      }
    } else {
      apiKeyInput.placeholder = 'Enter API key';
      modelInput.value = '';
    }

    if (state.rootFolderPath) {
      rootPathInput.value = state.rootFolderPath;
    }

    if (state.maxResultsShown) {
      maxResultsInput.value = state.maxResultsShown;
    }

    enableSymbolExtraction.checked = state.enableSymbolExtraction !== false;

    updateStatusForProvider(state.providerStatus, state.indexSize);
  }

  function updateModelVisibility() {
    geminiModelGroup.classList.toggle('hidden', currentProvider !== 'gemini');
    openaiModelGroup.classList.toggle('hidden', currentProvider !== 'openai');
    openrouterModelGroup.classList.toggle('hidden', currentProvider !== 'openrouter');
  }

  function updateStatusForProvider(providerStatus, indexSize) {
    if (indexSize === 0) {
      showStatus('Index is empty. Click "Rescan" below to build the index.', 'warn');
      return;
    }

    const current = providerStatus[currentProvider];
    if (current && !current.configured) {
      showStatus(`${currentProvider} API key not set. Configure below.`, 'warn');
    }
  }

  function showStatus(message, type) {
    statusBar.textContent = message;
    statusBar.className = `status-bar status-${type}`;
  }

  function showSettingsStatus(message, type) {
    settingsStatus.textContent = message;
    settingsStatus.className = `px-3 py-2 rounded text-xs border border-vscode-border status-${type}`;
    settingsStatus.classList.remove('hidden');
  }

  function hideSettingsStatus() {
    settingsStatus.className = 'hidden';
  }

  function hideStatus() {
    statusBar.className = 'status-bar hidden';
  }

  function showLoading(show) {
    searchBtn.disabled = show;
    document.getElementById('searchIcon').classList.toggle('hidden', show);
    document.getElementById('searchSpinner').classList.toggle('hidden', !show);
    if (show) emptyState.classList.add('hidden');
  }

  const LANGUAGE_ICONS = {
    typescript:
      'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg',
    typescriptreact:
      'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg',
    javascript:
      'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg',
    javascriptreact:
      'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg',
    python: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg',
    go: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/go/go-original.svg',
    rust: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/rust/rust-plain.svg',
    java: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg',
    csharp: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/csharp/csharp-original.svg',
    ruby: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/ruby/ruby-original.svg',
    php: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/php/php-original.svg',
    swift: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/swift/swift-original.svg',
    kotlin: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/kotlin/kotlin-original.svg',
    c: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/c/c-original.svg',
    cpp: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg',
    objectivec:
      'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/objectivec/objectivec-plain.svg',
    assembly: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/c/c-original.svg',
    fortran: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/fortran/fortran-original.svg',
    cobol: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cobol/cobol-original.svg',
    haskell: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/haskell/haskell-original.svg',
    lua: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/lua/lua-original.svg',
    zig: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/zig/zig-original.svg',
    nim: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nim/nim-original.svg',
    r: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/r/r-original.svg',
    dart: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/dart/dart-original.svg',
    julia: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/julia/julia-original.svg',
    perl: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/perl/perl-original.svg',
    elixir: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/elixir/elixir-original.svg',
    clojure: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/clojure/clojure-original.svg',
    erlang: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/erlang/erlang-original.svg',
    scala: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/scala/scala-original.svg',
    css: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/css3/css3-original.svg',
    scss: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/sass/sass-original.svg',
    html: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg',
    vue: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vuejs/vuejs-original.svg',
    svelte: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/svelte/svelte-original.svg',
    markdown: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/markdown/markdown-original.svg',
    json: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/json/json-original.svg',
    yaml: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/yaml/yaml-original.svg',
    shell: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bash/bash-original.svg',
    sql: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mysql/mysql-original.svg',
  };

  function langIcon(language) {
    const url = LANGUAGE_ICONS[language];
    if (!url) return '';
    return `<img src="${url}" class="w-3.5 h-3.5 inline-block mr-1.5 align-text-bottom" alt="${escapeHtml(language)}" />`;
  }

  function relativePath(absPath) {
    const ws = (workspacePathValue.textContent || '').replace(/^Workspace:\s*/, '');
    if (!ws) return absPath;
    if (absPath.startsWith(ws)) {
      let rel = absPath.slice(ws.length);
      if (rel.startsWith('/') || rel.startsWith('\\')) rel = rel.slice(1);
      return rel;
    }
    return absPath;
  }

  let lastResultPaths = [];

  function showResults(items, query) {
    if (!items || items.length === 0) {
      resultsSection.classList.add('hidden');
      emptyState.classList.remove('hidden');
      showStatus(`No results found for "${query}".`, 'warn');
      return;
    }

    lastResultPaths = items.map((i) => relativePath(i.filePath));
    resultsList.innerHTML = '';
    items.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'result-item';
      div.innerHTML = `
        <div class="flex items-center gap-4">
          <div class="p-0.5 border border-vscode-border rounded-full"><span class="text-[10px] text-gray-500 font-mono w-4 text-right shrink-0">${item.rank || ''}</span></div>
          <div class="min-w-0 flex-1">
            <div class="label flex items-center gap-1">
              ${langIcon(item.language)}${escapeHtml(item.label)}
            </div>
            <div class="desc">${escapeHtml(item.description || '')}</div>
          </div>
        </div>
      `;
      div.addEventListener('click', (e) => {
        if (e.ctrlKey || e.metaKey) {
          const rel = relativePath(item.filePath);
          vscode.postMessage({ type: 'copyToClipboard', text: rel });
          showStatus(`Copied: ${rel}`, 'ok');
          setTimeout(hideStatus, 2000);
        } else {
          vscode.postMessage({ type: 'openFile', filePath: item.filePath });
        }
      });
      resultsList.appendChild(div);
    });

    emptyState.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    copyAllPathsBtn.classList.remove('hidden');
    hideStatus();
  }

  copyAllPathsBtn.addEventListener('click', () => {
    if (lastResultPaths.length === 0) return;
    const text = lastResultPaths.join('\n');
    vscode.postMessage({ type: 'copyToClipboard', text });
    showStatus(`Copied ${lastResultPaths.length} path(s)`, 'ok');
    setTimeout(hideStatus, 2000);
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
