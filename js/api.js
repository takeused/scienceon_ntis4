    // ============================================================
    // API & Data Fetching
    // ============================================================

    async function checkProxy() {
      try {
        const res = await fetch(`${PROXY_BASE}/health`, { signal: AbortSignal.timeout(1500) });
        if (res.ok) { ACTIVE_PROXY = 'local'; updateProxyStatus(); return; }
      } catch { /* 로컬 프록시 없음 */ }
      ACTIVE_PROXY = 'direct';
      updateProxyStatus();
    }

    function getProxyBase() {
      return ACTIVE_PROXY === 'local' ? PROXY_BASE : null;
    }

    function getApiBase() {
      return ACTIVE_PROXY === 'local' ? `${PROXY_BASE}/api` : API_BASE_DIRECT;
    }

    function parseScienceONError(text, fallbackStatus) {
      try {
        const xml = new DOMParser().parseFromString(text, 'text/xml');
        const errCode = xml.querySelector('errorCode')?.textContent || xml.querySelector('code')?.textContent || '';
        const errMsg = xml.querySelector('errorMessage')?.textContent || xml.querySelector('message')?.textContent || '';
        if (errCode || errMsg) return `${errMsg || 'ScienceON API error'}${errCode ? ` (${errCode})` : ''}`;
      } catch { /* ignore XML parse failure */ }

      try {
        const data = JSON.parse(text);
        const errCode = data.errorCode || data.error_code || data.code || '';
        const errMsg = data.errorMessage || data.message || data.error || '';
        if (errCode || errMsg) return `${errMsg || 'ScienceON API error'}${errCode ? ` (${errCode})` : ''}`;
      } catch { /* ignore JSON parse failure */ }

      return `HTTP ${fallbackStatus}`;
    }

    async function doSearch(page = 1) {
      const query = document.getElementById('searchInput').value.trim();
      if (!query) {
        showToast('검색어를 입력해주세요', 'warning');
        document.getElementById('searchInput').focus();
        return;
      }
      
      document.body.classList.add('search-mode');

      if (STATE.currentTarget.startsWith('NTIS_')) {
        return doNTISSearch(page);
      }

      if (!STATE.clientId || !STATE.token) {
        if (STATE.clientId && STATE.apiKey && STATE.macAddr && PROXY_AVAILABLE) {
          showToast('토큰을 자동 발급 중입니다. 잠시 후 다시 검색해주세요 ⏳', 'info');
          await autoRequestToken();
          if (!STATE.token) return;
        } else if (!STATE.token) {
          showToast('🔑 Access Token이 필요합니다. 우측 상단 "API 설정" → "토큰 발급" 버튼을 눌러주세요', 'warning');
          setTimeout(() => openSettings(), 800);
          return;
        } else {
          showToast('API 설정이 필요합니다. 우측 상단 "API 설정" 버튼을 눌러주세요', 'error');
          return;
        }
      }

      STATE.currentQuery = query;
      STATE.currentPage = page;
      addToHistory(query);
      updateShareUrl(query, STATE.currentTarget);

      const searchField = document.getElementById('searchField').value;
      const sortField = document.getElementById('sortField').value;
      const rowCount = parseInt(document.getElementById('rowCount').value);
      const grouping = document.getElementById('groupingCheck').checked ? 'Y' : '';

      STATE.rowCount = rowCount;

      setLoading(true);
      hideAll();
      document.getElementById('resultsHeader').classList.remove('hidden');
      document.getElementById('advancedBar').classList.toggle('hidden', !STATE.advancedOpen);

      const searchQuery = JSON.stringify({ [searchField]: query });

      const params = new URLSearchParams({
        client_id: STATE.clientId,
        token: STATE.token,
        version: '1.0',
        action: 'search',
        target: STATE.currentTarget,
        searchQuery: searchQuery,
        curPage: page,
        rowCount: rowCount,
      });

      if (sortField) params.append('sortField', sortField);
      if (grouping) params.append('grouping', grouping);

      const url = `${getApiBase()}?${params.toString()}`;

      try {
        const resp = await fetch(url);
        const text = await resp.text();
        if (!resp.ok) throw new Error(parseScienceONError(text, resp.status));

        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'text/xml');

        const statusCode = xml.querySelector('statusCode')?.textContent;
        if (statusCode && statusCode !== '200') {
          const errMsg = xml.querySelector('errorMessage')?.textContent || '알 수 없는 오류';
          const errCode = xml.querySelector('errorCode')?.textContent || '';

          switch (errCode) {
            case 'E4103':
              if (STATE.refreshToken) {
                await refreshAccessToken();
                doSearch(page);
                return;
              }
              showToast('Access Token이 만료됐습니다 (E4103)', 'error');
              break;
            default:
              showToast(`${errMsg} (${errCode})`, 'error');
          }
          setLoading(false);
          return;
        }

        renderResults(xml, query);
        fetchTabCounts(query, searchField);
      } catch (err) {
        console.error(err);
        showToast(`요청 실패: ${err.message}`, 'error');
        setLoading(false);
        document.getElementById('emptyState').classList.remove('hidden');
      }
    }

    async function fetchTabCounts(query, searchField = 'BI') {
      const TARGETS = ['ARTI','PATENT','REPORT','ATT','RESEARCHER','ORGAN','TREND'];
      const searchQuery = JSON.stringify({ [searchField]: query });
      const base = getApiBase();

      const counts = await Promise.all(TARGETS.map(async target => {
        try {
          const params = new URLSearchParams({
            client_id: STATE.clientId, token: STATE.token,
            version: '1.0', action: 'search', target,
            searchQuery, curPage: 1, rowCount: 1,
          });
          const resp = await fetch(`${base}?${params}`);
          const text = await resp.text();
          const xml = new DOMParser().parseFromString(text, 'text/xml');
          const el = xml.querySelector('TotalCount') || xml.querySelector('totalCount');
          return parseInt(el?.textContent) || 0;
        } catch { return null; }
      }));

      document.querySelectorAll('#tabsScienceON .tab-btn').forEach(btn => {
        const idx = TARGETS.indexOf(btn.dataset.target);
        if (idx === -1) return;
        const n = counts[idx];
        if (n === null) return;
        const label = getTargetLabel(btn.dataset.target);
        const fmt = n >= 10000 ? `${(n/10000).toFixed(1)}만` : n.toLocaleString();
        btn.textContent = n > 0 ? `${label} (${fmt})` : label;
      });
    }


    async function autoRequestToken() {
      const { clientId, apiKey, macAddr } = STATE;
      if (!clientId || !apiKey || !macAddr || !PROXY_AVAILABLE) return;

      try {
        const url = `${getProxyBase()}/token?client_id=${encodeURIComponent(clientId)}&api_key=${encodeURIComponent(apiKey)}&mac_address=${encodeURIComponent(macAddr)}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const data = await resp.json();

        if (data.access_token) {
          STATE.token = data.access_token;
          STATE.tokenExpire = data.access_token_expire || '';
          STATE.refreshToken = data.refresh_token || '';
          localStorage.setItem('sc_token', STATE.token);
          localStorage.setItem('sc_token_expire', STATE.tokenExpire);
          localStorage.setItem('sc_refresh_token', STATE.refreshToken);
          updateProxyStatus();
          scheduleTokenRefresh();
          updateTokenExpireDisplay();
        }
      } catch (e) { console.warn('Auto token failed:', e); }
    }

    async function refreshAccessToken() {
      if (!STATE.refreshToken || !PROXY_AVAILABLE) return;
      try {
        const url = `${getProxyBase()}/token/refresh?client_id=${STATE.clientId}&refresh_token=${STATE.refreshToken}`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.access_token) {
          STATE.token = data.access_token;
          localStorage.setItem('sc_token', STATE.token);
          if (data.access_token_expire) {
            STATE.tokenExpire = data.access_token_expire;
            localStorage.setItem('sc_token_expire', STATE.tokenExpire);
          }
          scheduleTokenRefresh();
          updateTokenExpireDisplay();
          updateProxyStatus();
          return true;
        }
      } catch (e) { console.error('Refresh failed:', e); }
      return false;
    }

    async function runCompare() {
      const qA = document.getElementById('compareInputA').value.trim();
      const qB = document.getElementById('compareInputB').value.trim();
      if (!qA || !qB) { showToast('두 검색어를 모두 입력하세요.', 'warning'); return; }

      document.getElementById('compareLabelA').textContent = `"${qA}" — ${getTargetLabel(STATE.currentTarget)}`;
      document.getElementById('compareLabelB').textContent = `"${qB}" — ${getTargetLabel(STATE.currentTarget)}`;
      document.getElementById('compareGridA').innerHTML = '<div class="spinner mx-auto my-8"></div>';
      document.getElementById('compareGridB').innerHTML = '<div class="spinner mx-auto my-8"></div>';

      const fetchOne = async (query) => {
        const params = new URLSearchParams({ client_id: STATE.clientId, token: STATE.token,
          version: '1.0', action: 'search', target: STATE.currentTarget,
          searchQuery: JSON.stringify({ BI: query }), curPage: 1, rowCount: 5 });
        const resp = await fetch(`${getApiBase()}?${params}`);
        const text = await resp.text();
        const xml = new DOMParser().parseFromString(text, 'text/xml');
        
        // Token Expired check
        if (xml.querySelector('errorCode')?.textContent === 'E4103') {
          const ok = await refreshAccessToken();
          if (ok) return fetchOne(query);
        }
        return xml;
      };

      try {
        const [xmlA, xmlB] = await Promise.all([fetchOne(qA), fetchOne(qB)]);
        renderCompareGrid(xmlA, 'compareGridA');
        renderCompareGrid(xmlB, 'compareGridB');
      } catch (e) { showToast('비교 검색 오류: ' + e.message, 'error'); }
    }

    // Cerebras/AI RAG Helpers
    async function fetchDomainContext(mainQuery) {
      const fetchTop = async (target, n) => {
        const searchQuery = JSON.stringify({ BI: mainQuery });
        const url = `${getApiBase()}?client_id=${STATE.clientId}&token=${STATE.token}&version=1.0&action=search&target=${target}&searchQuery=${encodeURIComponent(searchQuery)}&rowCount=${n}`;
        try {
          const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
          return new DOMParser().parseFromString(await resp.text(), 'text/xml');
        } catch { return null; }
      };
      const [artiXml, patentXml] = await Promise.all([fetchTop('ARTI', 5), fetchTop('PATENT', 5)]);
      const extract = (xml) => Array.from(xml?.querySelectorAll('recordList record, record') || []).slice(0, 5);
      
      return {
        paperSummaries: extract(artiXml).map(item => `"${getVal(item, 'Title')}" — ${(getVal(item, 'Author')||'').split(/[;,|]/)[0].trim()} (${(getVal(item, 'Pubyear')||'').substring(0,4)})`),
        patentSummaries: extract(patentXml).map(item => `"${getVal(item, 'Title')}" — ${(getVal(item, 'Applicants')||'').split(/[;|,]/)[0].trim()} [${(getVal(item, 'IPC')||'').split(/[,;]/)[0].trim()}]`)
      };
    }
