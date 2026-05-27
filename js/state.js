    // ============================================================
    // State & Constants
    // ============================================================

    const STATE = {
      clientId: '',
      token: '',
      refreshToken: '',
      tokenExpire: '',
      apiKey: '',
      macAddr: '',
      ntisKey: '',
      cerebrasKey: '',
      currentTarget: 'ARTI',
      currentQuery: '',
      currentPage: 1,
      totalCount: 0,
      rowCount: 10,
      isLoading: false,
      advancedOpen: false,
      // 새 기능용
      searchHistory: JSON.parse(localStorage.getItem('sc_history') || '[]'),
      favorites: JSON.parse(localStorage.getItem('sc_favorites') || '[]'),
      currentItems: [],   // CSV 내보내기용 현재 결과 데이터
      compareMode: false,
    };

    // 기본값 (최초 실행 시 자동 설정)
    const DEFAULTS = {
      clientId: 'f6e85ce67ce13fa852a3f7d46b3b79eaa230e7ec7d59390164a07ff036c91198',
      apiKey: '6bb5af492a2647d085822e2afd75b9c5',
      macAddr: '9C-6B-00-8C-64-FD',
      ntisKey: 'y1vodniheb3q8w6j47f2',
    };

    const NTIS_BASE = 'https://www.ntis.go.kr';

    // 로컬 프록시 (proxy-server.js, 포트 3737)
    // 같은 서버에서 HTML을 서빙받은 경우(인트라넷 포함) → 자동으로 해당 호스트 사용
    const PROXY_BASE = (() => {
      const { protocol, hostname, port } = window.location;
      if (port === '3737') return `${protocol}//${hostname}:3737`;   // 프록시에서 직접 서빙
      return 'http://127.0.0.1:3737';                                 // 로컬 파일로 열었을 때
    })();
    const API_BASE_DIRECT  = 'https://apigateway.kisti.re.kr/openapicall.do';
    const TOKEN_URL_DIRECT = 'https://apigateway.kisti.re.kr/tokenrequest.do';

    // 외부 프록시 (로컬 전용 운영 시 미사용 — 변수 참조 오류 방지용 선언)
    const VERCEL_BASE    = '';
    const CF_WORKER_BASE = 'https://YOUR_CF_SUBDOMAIN.workers.dev';

    // 현재 활성 프록시 ('local' | 'direct')
    let ACTIVE_PROXY = 'direct';
    Object.defineProperty(window, 'PROXY_AVAILABLE', {
      get() { return ACTIVE_PROXY === 'local'; },
      configurable: true,
    });
