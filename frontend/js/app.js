const BASE_PATH = '/paper-hot';
const STATE_STORAGE_KEY = 'paperHot.currentState';
const MOTTO_STORAGE_KEY = 'paperHot.dailyMotto';
const DAILY_MOTTOS = [
    '放下个人素质，享受缺德人生',
    '今天少点内耗，多点图表',
    '文献读不完，快乐不能断',
    '科研使人冷静，咖啡使人续命',
    '保持怀疑，保持下班',
    '数据会说话，我先闭嘴',
    '先跑起来，再慢慢优雅',
    '做人先放过自己',
    '今天不卷，明天再说',
    '有问题就分析，没问题就休息'
];
let currentFilename = null;
let currentData = null;
let currentPapers = [];
let filteredPapers = [];
let selectedPaperIndices = new Set();
let titleSearchResults = [];
let currentNetworkData = null;
let currentCitationNetworkData = null;
let charts = {};

document.addEventListener('DOMContentLoaded', () => {
    setupDailyMotto();
    setupEventListeners();
    restoreSavedSession();
});

function setupDailyMotto() {
    const mottoElement = document.getElementById('dailyMotto');
    if (!mottoElement) return;

    const now = new Date();
    const todayKey = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
    ].join('-');

    try {
        const saved = JSON.parse(localStorage.getItem(MOTTO_STORAGE_KEY) || '{}');
        if (saved.date === todayKey && DAILY_MOTTOS.includes(saved.motto)) {
            mottoElement.textContent = saved.motto;
            return;
        }

        const motto = DAILY_MOTTOS[Math.floor(Math.random() * DAILY_MOTTOS.length)];
        localStorage.setItem(MOTTO_STORAGE_KEY, JSON.stringify({ date: todayKey, motto }));
        mottoElement.textContent = motto;
    } catch (error) {
        console.warn('每日短句初始化失败:', error);
        const dayIndex = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
        mottoElement.textContent = DAILY_MOTTOS[dayIndex % DAILY_MOTTOS.length];
    }
}

function setupEventListeners() {
    document.getElementById('searchBtn').addEventListener('click', searchPapers);
    document.getElementById('uploadBtn').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
    document.getElementById('uploadArea').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('authorCount').addEventListener('change', reloadAuthorChart);
    document.getElementById('downloadAllBtn').addEventListener('click', downloadAllPapers);
    document.getElementById('downloadCsvBtn').addEventListener('click', downloadCurrentCsv);
    document.getElementById('downloadReportBtn').addEventListener('click', downloadReport);
    document.getElementById('papersList').addEventListener('click', handleDownloadListClick);
    document.getElementById('paperTextFilter').addEventListener('input', applyPaperFilters);
    document.getElementById('paperStartYearFilter').addEventListener('input', applyPaperFilters);
    document.getElementById('paperEndYearFilter').addEventListener('input', applyPaperFilters);
    document.getElementById('paperOaFilter').addEventListener('change', applyPaperFilters);
    document.getElementById('citationNetworkLimit').addEventListener('change', handleCitationNetworkLimitChange);
    document.getElementById('enrichReferencesBtn').addEventListener('click', enrichReferences);
    document.getElementById('enrichMetadataBtn').addEventListener('click', enrichMetadata);
    document.getElementById('clearPaperFiltersBtn').addEventListener('click', clearPaperFilters);
    document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelectedPapers);
    document.getElementById('selectAllPapers').addEventListener('change', toggleSelectAllPapers);
    document.getElementById('allPapersTable').addEventListener('change', handlePaperTableChange);
    document.getElementById('allPapersTable').addEventListener('click', handlePaperTableClick);
    document.getElementById('openAddPaperBtn').addEventListener('click', openAddPaperModal);
    document.getElementById('closeAddPaperModalBtn').addEventListener('click', closeAddPaperModal);
    document.getElementById('searchTitleBtn').addEventListener('click', searchTitleCandidates);
    document.getElementById('titleSearchInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchTitleCandidates();
    });
    document.getElementById('appendCsvBtn').addEventListener('click', () => document.getElementById('appendCsvInput').click());
    document.getElementById('appendCsvInput').addEventListener('change', handleAppendCsvSelect);
    document.getElementById('titleSearchResults').addEventListener('click', handleTitleSearchResultClick);
    document.getElementById('addPaperModal').addEventListener('click', (e) => {
        if (e.target.id === 'addPaperModal') closeAddPaperModal();
    });
    
    // 拖拽上传
    const uploadArea = document.getElementById('uploadArea');
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect(files);
        }
    });
    
    // 绑定标签页点击事件
    const tabsContainer = document.querySelector('.tabs-section');
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('.tab-btn');
            if (tabBtn && tabBtn.dataset.tab) {
                switchTab(tabBtn.dataset.tab);
            }
        });
    }
    
    // 兼容性：直接绑定到已有的按钮
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const tabName = e.currentTarget.dataset.tab;
            if (tabName) {
                switchTab(tabName);
            }
        });
    });
}

function encodeFilename(filename) {
    return encodeURIComponent(filename);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatYear(value) {
    if (value === null || value === undefined || value === '' || value === 'nan') return '';
    return String(value).replace(/\.0$/, '');
}

function abbreviatePaperTitle(title, fallbackIndex) {
    const rawTitle = String(title || '').trim();
    if (!rawTitle) return `P${fallbackIndex + 1}`;

    const cjkChars = rawTitle.match(/[\u4e00-\u9fff]/g);
    if (cjkChars && cjkChars.length >= 3) {
        return cjkChars.slice(0, 4).join('');
    }

    const stopWords = new Set([
        'a', 'an', 'and', 'are', 'as', 'at', 'based', 'beneath', 'between',
        'by', 'during', 'for', 'from', 'in', 'into', 'near', 'of', 'on',
        'the', 'to', 'using', 'via', 'with'
    ]);
    const words = rawTitle
        .replace(/[^A-Za-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .map(word => word.replace(/^-+|-+$/g, ''))
        .filter(Boolean);
    const meaningfulWords = words
        .filter(word => !stopWords.has(word.toLowerCase()))
        .slice(0, 5);
    const sourceWords = meaningfulWords.length >= 2 ? meaningfulWords : words.slice(0, 4);
    const acronym = sourceWords
        .map(word => word.charAt(0).toUpperCase())
        .join('')
        .slice(0, 6);

    return acronym || `P${fallbackIndex + 1}`;
}

function getSavedState() {
    try {
        return JSON.parse(localStorage.getItem(STATE_STORAGE_KEY) || '{}');
    } catch (error) {
        console.warn('读取保存状态失败:', error);
        return {};
    }
}

function saveAppState(extra = {}) {
    const state = {
        filename: currentFilename,
        activeTab: getActiveTabName(),
        filters: {
            text: document.getElementById('paperTextFilter')?.value || '',
            startYear: document.getElementById('paperStartYearFilter')?.value || '',
            endYear: document.getElementById('paperEndYearFilter')?.value || '',
            oa: document.getElementById('paperOaFilter')?.value || 'all'
        },
        authorCount: document.getElementById('authorCount')?.value || '50',
        citationLimit: document.getElementById('citationNetworkLimit')?.value || '50',
        ...extra
    };
    if (!state.filename) return;
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
}

function restoreFilters(filters = {}) {
    document.getElementById('paperTextFilter').value = filters.text || '';
    document.getElementById('paperStartYearFilter').value = filters.startYear || '';
    document.getElementById('paperEndYearFilter').value = filters.endYear || '';
    document.getElementById('paperOaFilter').value = filters.oa || 'all';
}

function restoreCitationLimit(value) {
    const limitSelect = document.getElementById('citationNetworkLimit');
    const allowedValues = new Set(['10', '50', '100', '200', '500']);
    limitSelect.value = allowedValues.has(String(value)) ? String(value) : '50';
}

async function restoreSavedSession() {
    const state = getSavedState();
    if (!state.filename) return;

    if (state.authorCount) {
        document.getElementById('authorCount').value = state.authorCount;
    }
    restoreCitationLimit(state.citationLimit);
    restoreFilters(state.filters);

    try {
        await loadAnalysis(state.filename, {
            resetFilters: false,
            activeTab: state.activeTab || 'overview',
            restoring: true
        });
    } catch (error) {
        console.warn('恢复上次状态失败:', error);
        localStorage.removeItem(STATE_STORAGE_KEY);
    }
}

function openAddPaperModal() {
    if (!currentFilename) {
        alert('请先搜索或上传一个CSV文件');
        return;
    }
    document.getElementById('addPaperModal').style.display = 'flex';
    document.getElementById('titleSearchInput').focus();
}

function closeAddPaperModal() {
    document.getElementById('addPaperModal').style.display = 'none';
}

function getActiveTabName() {
    return document.querySelector('.tab-btn.active')?.dataset.tab || 'overview';
}

function getCitationDisplayLimit() {
    const value = parseInt(document.getElementById('citationNetworkLimit')?.value, 10);
    return [10, 50, 100, 200, 500].includes(value) ? value : 50;
}

function handleCitationNetworkLimitChange() {
    if (currentCitationNetworkData) {
        displayCitationNetwork(currentCitationNetworkData);
    }
    saveAppState();
}

function initChart(chartId, chartKey) {
    const chartDom = document.getElementById(chartId);
    if (!chartDom) return null;

    if (typeof echarts === 'undefined') {
        chartDom.innerHTML = '<div class="chart-placeholder">图表库未加载，请检查网络后刷新页面</div>';
        return null;
    }

    if (chartDom.offsetWidth === 0 || chartDom.offsetHeight === 0) {
        return null;
    }

    if (charts[chartKey]) {
        try {
            charts[chartKey].dispose();
        } catch (error) {
            console.warn(`释放图表 ${chartKey} 失败:`, error);
        }
        delete charts[chartKey];
    }
    chartDom.replaceChildren();
    charts[chartKey] = echarts.init(chartDom);
    return charts[chartKey];
}

function setChartHeight(chartId, itemCount, minHeight = 420, rowHeight = 26) {
    const chartDom = document.getElementById(chartId);
    if (!chartDom) return;
    chartDom.style.height = `${Math.max(minHeight, itemCount * rowHeight + 90)}px`;
}

function renderChartsForTab(tabName = getActiveTabName()) {
    if (!currentData) return;

    if (tabName === 'overview') {
        renderYearChart(currentData.yearly_stats);
        renderJournalChartSmall(currentData.journal_stats.slice(0, 10));
    } else if (tabName === 'trends') {
        renderTrendChart(currentData.yearly_stats);
    } else if (tabName === 'journals') {
        renderJournalChart(currentData.journal_stats);
    } else if (tabName === 'countries') {
        renderCountryChart(currentData.country_stats);
    } else if (tabName === 'authors') {
        renderAuthorChart(currentData.author_stats);
    } else if (tabName === 'concepts') {
        renderConceptChart(currentData.concept_stats);
    } else if (tabName === 'network' && currentNetworkData) {
        displayNetwork(currentNetworkData);
    } else if (tabName === 'citation' && currentCitationNetworkData) {
        displayCitationNetwork(currentCitationNetworkData);
    } else if (tabName === 'report') {
        renderReport();
    }
}

async function handleFileSelect(event) {
    const file = event.target?.files?.[0] || event?.[0];
    if (file) {
        await uploadFile(file);
    }
}

async function uploadFile(file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
        alert('请上传CSV文件');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    showStatus('⏳', '正在上传文件...');
    
    try {
        const response = await fetch(`${BASE_PATH}/api/upload`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            currentFilename = result.filename;
            
            showStatus('✅', '文件上传成功！');
            setTimeout(() => {
                hideStatus();
                loadAnalysis(currentFilename);
            }, 1000);
        }
    } catch (error) {
        showStatus('❌', '上传失败: ' + error.message);
    }
}

async function searchPapers() {
    const keyword = document.getElementById('keyword').value.trim();
    const maxResults = parseInt(document.getElementById('maxResults').value) || 500;
    const startYear = document.getElementById('startYear').value ? parseInt(document.getElementById('startYear').value) : null;
    const endYear = document.getElementById('endYear').value ? parseInt(document.getElementById('endYear').value) : null;
    const deepSearch = document.getElementById('deepSearch').checked;
    
    if (!keyword) {
        alert('请输入关键词');
        return;
    }
    
    showStatus('⏳', deepSearch ? '正在深度检索文献，可能需要更久...' : '正在搜索文献...');
    
    try {
        const response = await fetch(`${BASE_PATH}/api/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                keyword,
                max_results: maxResults,
                start_year: startYear,
                end_year: endYear,
                deep_search: deepSearch
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            currentFilename = result.csv_path.split('/').pop();
            currentData = result.papers;
            
            const modeText = result.search_mode === 'deep' ? '深度检索' : '普通检索';
            showStatus('✅', `${modeText}在期刊白名单内获取 ${result.count} 篇文献！`);
            setTimeout(() => {
                hideStatus();
                loadAnalysis(currentFilename);
            }, 1500);
        }
    } catch (error) {
        showStatus('❌', '搜索失败: ' + error.message);
    }
}

async function loadAnalysis(filename, options = {}) {
    const {
        resetFilters = true,
        activeTab = getActiveTabName(),
        restoring = false
    } = options;
    currentFilename = filename;
    
    showStatus('⏳', restoring ? '正在恢复上次状态...' : '正在分析数据...');
    
    try {
        const authorCount = parseInt(document.getElementById('authorCount').value) || 50;
        const response = await fetch(`${BASE_PATH}/api/analysis/${encodeFilename(filename)}?author_count=${authorCount}`);
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.detail || '分析失败');
        }

        currentData = result.analysis;
        currentNetworkData = null;
        currentCitationNetworkData = null;
        if (resetFilters) {
            resetPaperFilters();
        }
        document.getElementById('tabsSection').style.display = 'block';
        document.getElementById('contentSection').style.display = 'block';

        await loadPapersList(filename);
        displayAnalysis(result.analysis);
        await Promise.all([loadNetwork(filename), loadCitationNetwork(filename)]);
        switchTab(activeTab || 'overview', { skipSave: true });
        renderChartsForTab(activeTab || 'overview');
        saveAppState({ activeTab: activeTab || 'overview' });
        hideStatus();
    } catch (error) {
        if (restoring) {
            console.warn('恢复上次状态失败:', error);
            localStorage.removeItem(STATE_STORAGE_KEY);
            currentFilename = null;
            document.getElementById('tabsSection').style.display = 'none';
            document.getElementById('contentSection').style.display = 'none';
            hideStatus();
            return;
        }
        showStatus('❌', '分析失败: ' + error.message);
    }
}

async function reloadAuthorChart() {
    if (!currentFilename || !currentData) return;
    
    const authorCount = parseInt(document.getElementById('authorCount').value) || 50;
    saveAppState();
    
    try {
        const response = await fetch(`${BASE_PATH}/api/analysis/${encodeFilename(currentFilename)}?author_count=${authorCount}`);
        const result = await response.json();
        
        if (result.success) {
            currentData = {
                ...currentData,
                author_stats: result.analysis.author_stats,
                top_cited_authors: result.analysis.top_cited_authors
            };
            if (getActiveTabName() === 'authors') {
                renderAuthorChart(result.analysis.author_stats);
            } else if (getActiveTabName() === 'report') {
                renderReport();
            }
            renderTopCitedAuthorsTable(result.analysis.top_cited_authors);
        }
    } catch (error) {
        console.error('重新加载作者图表失败:', error);
    }
}

async function loadPapersList(filename) {
    try {
        const response = await fetch(`${BASE_PATH}/api/papers/${encodeFilename(filename)}`);
        const result = await response.json();
        
        if (result.success) {
            currentPapers = result.papers;
            selectedPaperIndices.clear();
            displayPapersList(result.papers);
            applyPaperFilters();
            return true;
        }
    } catch (error) {
        console.error('加载论文列表失败:', error);
    }
    return false;
}

function displayPapersList(papers) {
    const container = document.getElementById('papersList');
    container.innerHTML = papers.map(paper => `
        <div class="paper-item">
            <div class="paper-info">
                <div class="paper-title">${escapeHtml(paper.title || '无标题')}</div>
                <div class="paper-authors">${escapeHtml(paper.authors || '无作者')}</div>
            </div>
            ${paper.has_pdf 
                ? `<button class="paper-btn download" data-url="${escapeHtml(paper.pdf_url)}" data-title="${escapeHtml(paper.title)}">下载PDF</button>`
                : `<button class="paper-btn unavailable" disabled>不可下载</button>`
            }
        </div>
    `).join('');
}

function handleDownloadListClick(event) {
    const button = event.target.closest('.paper-btn.download');
    if (!button) return;
    downloadSinglePaper(button.dataset.url, button.dataset.title);
}

function applyPaperFilters() {
    const text = document.getElementById('paperTextFilter').value.trim().toLowerCase();
    const startYear = parseInt(document.getElementById('paperStartYearFilter').value);
    const endYear = parseInt(document.getElementById('paperEndYearFilter').value);
    const oaFilter = document.getElementById('paperOaFilter').value;

    filteredPapers = currentPapers.filter(paper => {
        const haystack = [
            paper.title,
            paper.authors,
            paper.journal,
            paper.doi
        ].join(' ').toLowerCase();

        if (text && !haystack.includes(text)) return false;

        const year = parseInt(paper.year);
        if (!Number.isNaN(startYear) && (Number.isNaN(year) || year < startYear)) return false;
        if (!Number.isNaN(endYear) && (Number.isNaN(year) || year > endYear)) return false;

        if (oaFilter === 'oa' && !paper.is_open_access) return false;
        if (oaFilter === 'closed' && paper.is_open_access) return false;

        return true;
    });

    renderAllPapersTable(filteredPapers);
    saveAppState();
}

function clearPaperFilters() {
    resetPaperFilters();
    applyPaperFilters();
}

function resetPaperFilters() {
    document.getElementById('paperTextFilter').value = '';
    document.getElementById('paperStartYearFilter').value = '';
    document.getElementById('paperEndYearFilter').value = '';
    document.getElementById('paperOaFilter').value = 'all';
}

function renderAllPapersTable(papers) {
    const tbody = document.querySelector('#allPapersTable tbody');
    const summary = document.getElementById('paperFilterSummary');
    summary.textContent = `显示 ${papers.length} / ${currentPapers.length} 篇，已选 ${selectedPaperIndices.size} 篇`;

    if (!papers.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="muted-cell">没有匹配的文章</td></tr>`;
        document.getElementById('selectAllPapers').checked = false;
        return;
    }

    tbody.innerHTML = papers.map(paper => {
        const index = Number(paper.index);
        const checked = selectedPaperIndices.has(index) ? 'checked' : '';
        return `
            <tr>
                <td><input type="checkbox" class="paper-select" data-index="${index}" ${checked} /></td>
                <td>
                    <div class="paper-title-cell">${escapeHtml(paper.title || '无标题')}</div>
                    <div class="muted-cell">${escapeHtml(paper.doi || '')}</div>
                </td>
                <td>${escapeHtml(paper.authors || '')}</td>
                <td>${escapeHtml(paper.journal || '')}</td>
                <td>${escapeHtml(formatYear(paper.year))}</td>
                <td>${escapeHtml(paper.cited_by_count ?? 0)}</td>
                <td>${paper.is_open_access ? '是' : '否'}</td>
                <td><button class="btn btn-danger btn-small delete-paper-btn" data-index="${index}">删除</button></td>
            </tr>
        `;
    }).join('');

    const visibleIndices = papers.map(paper => Number(paper.index));
    document.getElementById('selectAllPapers').checked =
        visibleIndices.length > 0 && visibleIndices.every(index => selectedPaperIndices.has(index));
}

function handlePaperTableChange(event) {
    const checkbox = event.target.closest('.paper-select');
    if (!checkbox) return;

    const index = Number(checkbox.dataset.index);
    if (checkbox.checked) {
        selectedPaperIndices.add(index);
    } else {
        selectedPaperIndices.delete(index);
    }
    renderAllPapersTable(filteredPapers);
}

function handlePaperTableClick(event) {
    const deleteButton = event.target.closest('.delete-paper-btn');
    if (!deleteButton) return;

    const index = Number(deleteButton.dataset.index);
    if (!Number.isNaN(index) && confirm('确定删除这篇文献吗？')) {
        deletePapers([index]);
    }
}

function toggleSelectAllPapers(event) {
    const checked = event.target.checked;
    filteredPapers.forEach(paper => {
        const index = Number(paper.index);
        if (checked) {
            selectedPaperIndices.add(index);
        } else {
            selectedPaperIndices.delete(index);
        }
    });
    renderAllPapersTable(filteredPapers);
}

async function deleteSelectedPapers() {
    const indices = Array.from(selectedPaperIndices);
    if (!indices.length) {
        alert('请先选择要删除的文献');
        return;
    }
    if (!confirm(`确定删除选中的 ${indices.length} 篇文献吗？`)) return;
    await deletePapers(indices);
}

async function deletePapers(indices) {
    try {
        showStatus('⏳', '正在删除文献...');
        const response = await fetch(`${BASE_PATH}/api/papers/${encodeFilename(currentFilename)}/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ indices })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.detail || result.message || '删除失败');
        }
        selectedPaperIndices.clear();
        showStatus('✅', `已删除 ${result.deleted} 篇文献`);
        setTimeout(() => loadAnalysis(currentFilename), 500);
    } catch (error) {
        showStatus('❌', '删除失败: ' + error.message);
    }
}

async function searchTitleCandidates() {
    const title = document.getElementById('titleSearchInput').value.trim();
    const status = document.getElementById('titleSearchStatus');
    const resultsContainer = document.getElementById('titleSearchResults');

    if (!title) {
        status.textContent = '请输入文章题目';
        return;
    }

    status.textContent = '正在搜索...';
    resultsContainer.innerHTML = '';

    try {
        const response = await fetch(`${BASE_PATH}/api/title-search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, max_results: 8 })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.detail || '搜索失败');
        }

        titleSearchResults = result.papers || [];
        status.textContent = `在期刊白名单内找到 ${titleSearchResults.length} 个候选结果`;
        renderTitleSearchResults();
    } catch (error) {
        status.textContent = '搜索失败: ' + error.message;
    }
}

function renderTitleSearchResults() {
    const container = document.getElementById('titleSearchResults');
    if (!titleSearchResults.length) {
        container.innerHTML = '<div class="muted-cell">期刊白名单内没有候选结果</div>';
        return;
    }

    container.innerHTML = titleSearchResults.map((paper, index) => `
        <div class="candidate-paper">
            <div>
                <div class="candidate-title">${escapeHtml(paper.title || '无标题')}</div>
                <div class="candidate-meta">
                    ${escapeHtml(formatYear(paper.year))} · ${escapeHtml(paper.journal || '未知期刊')} · 被引 ${escapeHtml(paper.cited_by_count || 0)}
                </div>
                <div class="candidate-meta">${escapeHtml(paper.authors || '')}</div>
            </div>
            <button class="btn btn-primary btn-small add-candidate-btn" data-index="${index}">添加</button>
        </div>
    `).join('');
}

async function handleTitleSearchResultClick(event) {
    const button = event.target.closest('.add-candidate-btn');
    if (!button) return;

    const index = Number(button.dataset.index);
    const paper = titleSearchResults[index];
    if (!paper) return;

    try {
        button.disabled = true;
        button.textContent = '添加中...';
        const response = await fetch(`${BASE_PATH}/api/papers/${encodeFilename(currentFilename)}/append`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ papers: [paper] })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.detail || '添加失败');
        }

        document.getElementById('titleSearchStatus').textContent =
            `新增 ${result.added} 篇，跳过 ${result.skipped} 篇重复记录`;
        await loadAnalysis(currentFilename);
    } catch (error) {
        document.getElementById('titleSearchStatus').textContent = '添加失败: ' + error.message;
    } finally {
        button.disabled = false;
        button.textContent = '添加';
    }
}

async function handleAppendCsvSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const status = document.getElementById('titleSearchStatus');
    if (!file.name.toLowerCase().endsWith('.csv')) {
        status.textContent = '请导入CSV文件';
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    status.textContent = '正在导入CSV...';

    try {
        const response = await fetch(`${BASE_PATH}/api/papers/${encodeFilename(currentFilename)}/append-csv`, {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.detail || '导入失败');
        }
        status.textContent = `新增 ${result.added} 篇，跳过 ${result.skipped} 篇重复记录`;
        event.target.value = '';
        await loadAnalysis(currentFilename);
    } catch (error) {
        status.textContent = '导入失败: ' + error.message;
    }
}

async function downloadSinglePaper(url, title) {
    try {
        window.open(url, '_blank');
    } catch (error) {
        alert('下载失败: ' + error.message);
    }
}

async function downloadAllPapers() {
    if (!currentFilename) {
        alert('请先搜索或选择数据文件');
        return;
    }
    
    const statusEl = document.getElementById('downloadAllStatus');
    statusEl.innerHTML = '<p>⏳ 正在准备下载...</p>';
    
    try {
        const response = await fetch(`${BASE_PATH}/api/download/${encodeFilename(currentFilename)}`, { method: 'POST' });
        
        if (!response.ok) {
            throw new Error('下载失败');
        }

        const contentType = response.headers.get('Content-Type') || '';
        if (contentType.includes('application/json')) {
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || '没有可下载的 PDF');
            }
            statusEl.innerHTML = '<p>✅ 下载完成！</p>';
            return;
        }
        
        // 获取文件名
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'papers.zip';
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
            if (filenameMatch) {
                filename = filenameMatch[1];
            }
        }
        
        // 创建下载链接
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        statusEl.innerHTML = '<p>✅ 下载完成！</p>';
    } catch (error) {
        statusEl.innerHTML = `<p>❌ 下载失败: ${error.message}</p>`;
    }
}

function downloadCurrentCsv() {
    if (!currentFilename) {
        alert('请先搜索或上传文献数据');
        return;
    }

    const a = document.createElement('a');
    a.href = `${BASE_PATH}/api/download-csv/${encodeFilename(currentFilename)}`;
    a.download = currentFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

async function enrichReferences() {
    if (!currentFilename) {
        alert('请先搜索或上传文献数据');
        return;
    }

    const status = document.getElementById('referenceEnrichStatus');
    const button = document.getElementById('enrichReferencesBtn');
    status.textContent = '正在补全引用信息，引用多的时候会慢一些...';
    button.disabled = true;
    button.textContent = '补全中...';

    try {
        const response = await fetch(`${BASE_PATH}/api/references/${encodeFilename(currentFilename)}/enrich`, {
            method: 'POST'
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.detail || '补全失败');
        }

        const limitNote = result.truncated ? '；引用太多，本次只处理了前一部分' : '';
        status.textContent =
            `已补全 ${result.enriched_references} / ${result.unique_references} 条唯一引用，更新 ${result.papers_updated} 篇论文${limitNote}`;
        await loadAnalysis(currentFilename, {
            resetFilters: false,
            activeTab: 'citation'
        });
    } catch (error) {
        status.textContent = '补全引用信息失败: ' + error.message;
    } finally {
        button.disabled = false;
        button.textContent = '补全引用信息';
    }
}

async function enrichMetadata() {
    if (!currentFilename) {
        alert('请先搜索或上传文献数据');
        return;
    }

    const status = document.getElementById('metadataEnrichStatus');
    const button = document.getElementById('enrichMetadataBtn');
    status.textContent = '正在用 Crossref、Semantic Scholar、Unpaywall 补全文献信息...';
    button.disabled = true;
    button.textContent = '补全中...';

    try {
        const response = await fetch(`${BASE_PATH}/api/papers/${encodeFilename(currentFilename)}/enrich-metadata`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                max_papers: 300,
                crossref: true,
                semantic_scholar: true,
                unpaywall: true
            })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.detail || '补全失败');
        }

        const hits = result.source_hits || {};
        const errors = result.source_errors || {};
        const limitNote = result.truncated ? `；文献较多，本次先处理前 ${result.processed_papers} 篇` : '';
        const errorNote = Object.values(errors).some(value => Number(value) > 0)
            ? `；部分来源限速或失败 ${Object.entries(errors).map(([name, count]) => `${name} ${count}`).join('，')}`
            : '';
        status.textContent =
            `多源补全完成：更新 ${result.papers_updated} / ${result.processed_papers} 篇；Crossref ${hits.Crossref || 0}，Semantic Scholar ${hits['Semantic Scholar'] || 0}，Unpaywall ${hits.Unpaywall || 0}${limitNote}${errorNote}`;

        await loadAnalysis(currentFilename, {
            resetFilters: false,
            activeTab: getActiveTabName() || 'overview'
        });
    } catch (error) {
        status.textContent = '多源补全失败: ' + error.message;
    } finally {
        button.disabled = false;
        button.textContent = '多源补全信息';
    }
}

function formatNumber(value) {
    const number = Number(value) || 0;
    return number.toLocaleString();
}

function getReportTotals() {
    const totals = currentData?.total_stats || {};
    return {
        papers: totals.total_papers ?? currentPapers.length ?? 0,
        citations: totals.total_citations ?? (currentData?.yearly_stats || []).reduce((sum, row) => sum + (Number(row.citations) || 0), 0),
        journals: totals.total_journals ?? (currentData?.journal_stats || []).length,
        authors: totals.total_authors ?? (currentData?.author_stats || []).length
    };
}

function getPeakRecord(rows, valueKey) {
    return [...(rows || [])].sort((a, b) => (Number(b[valueKey]) || 0) - (Number(a[valueKey]) || 0))[0] || null;
}

function renderReportTable(rows, columns, emptyText = '暂无数据') {
    if (!rows || rows.length === 0) {
        return `<p class="report-empty">${escapeHtml(emptyText)}</p>`;
    }

    return `
        <table class="report-table">
            <thead>
                <tr>${columns.map(column => `<th>${escapeHtml(column.label)}</th>`).join('')}</tr>
            </thead>
            <tbody>
                ${rows.map(row => `
                    <tr>
                        ${columns.map(column => `<td>${escapeHtml(column.format ? column.format(row[column.key], row) : row[column.key])}</td>`).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function buildReportHtml() {
    if (!currentData) {
        return '<div class="report-placeholder">请先搜索或上传文献数据。</div>';
    }

    const totals = getReportTotals();
    const yearlyStats = currentData.yearly_stats || [];
    const topYearByCount = getPeakRecord(yearlyStats, 'count');
    const topYearByCitations = getPeakRecord(yearlyStats, 'citations');
    const citationNodes = currentCitationNetworkData?.nodes || [];
    const citationEdges = currentCitationNetworkData?.edges || [];
    const resolvedReferenceCount = citationNodes.reduce((sum, node) => sum + (Number(node.resolved_references) || 0), 0);
    const networkNodes = currentNetworkData?.nodes || [];
    const networkEdges = currentNetworkData?.edges || [];
    const topPapers = (currentData.citation_stats || []).slice(0, 10);
    const topAuthors = (currentData.author_stats || []).slice(0, 10);
    const topCitedAuthors = (currentData.top_cited_authors || []).slice(0, 10);
    const topJournals = (currentData.journal_stats || []).slice(0, 10);
    const topCountries = (currentData.country_stats || []).slice(0, 10);
    const topConcepts = (currentData.concept_stats || []).slice(0, 10);

    return `
        <article class="report-document">
            <header class="report-header">
                <div>
                    <h2>PaperHot 文献分析报告</h2>
                    <p>${escapeHtml(currentFilename || '当前文献集合')}</p>
                </div>
                <div class="report-meta">
                    <span>生成时间</span>
                    <strong>${escapeHtml(new Date().toLocaleString())}</strong>
                </div>
            </header>

            <section class="report-section">
                <h3>总览</h3>
                <div class="report-metrics">
                    <div><strong>${formatNumber(totals.papers)}</strong><span>文献数</span></div>
                    <div><strong>${formatNumber(totals.citations)}</strong><span>总被引</span></div>
                    <div><strong>${formatNumber(totals.journals)}</strong><span>期刊数</span></div>
                    <div><strong>${formatNumber(totals.authors)}</strong><span>作者数</span></div>
                </div>
                <div class="report-summary-grid">
                    <p><strong>发表数量峰值：</strong>${topYearByCount ? `${escapeHtml(formatYear(topYearByCount.year))} 年，${formatNumber(topYearByCount.count)} 篇` : '暂无数据'}</p>
                    <p><strong>被引峰值年份：</strong>${topYearByCitations ? `${escapeHtml(formatYear(topYearByCitations.year))} 年，${formatNumber(topYearByCitations.citations)} 次` : '暂无数据'}</p>
                    <p><strong>合作网络：</strong>${formatNumber(networkNodes.length)} 个作者节点，${formatNumber(networkEdges.length)} 条合作关系。</p>
                    <p><strong>引文网络：</strong>${formatNumber(citationNodes.length)} 个论文节点，${formatNumber(citationEdges.length)} 条集合内引用关系。</p>
                    <p><strong>引用补全：</strong>${formatNumber(resolvedReferenceCount)} 条参考文献元数据已补全。</p>
                </div>
            </section>

            <section class="report-section">
                <h3>高被引论文 Top 10</h3>
                ${renderReportTable(topPapers, [
                    { key: 'title', label: '标题' },
                    { key: 'authors', label: '作者' },
                    { key: 'year', label: '年份', format: formatYear },
                    { key: 'cited_by_count', label: '被引', format: formatNumber }
                ])}
            </section>

            <section class="report-section two-column">
                <div>
                    <h3>期刊 Top 10</h3>
                    ${renderReportTable(topJournals, [
                        { key: 'journal', label: '期刊' },
                        { key: 'count', label: '论文数', format: formatNumber }
                    ])}
                </div>
                <div>
                    <h3>高产作者 Top 10</h3>
                    ${renderReportTable(topAuthors, [
                        { key: 'author', label: '作者' },
                        { key: 'count', label: '论文数', format: formatNumber }
                    ])}
                </div>
            </section>

            <section class="report-section two-column">
                <div>
                    <h3>高被引作者 Top 10</h3>
                    ${renderReportTable(topCitedAuthors, [
                        { key: 'author', label: '作者' },
                        { key: 'paper_count', label: '论文数', format: formatNumber },
                        { key: 'total_citations', label: '总被引', format: formatNumber }
                    ])}
                </div>
                <div>
                    <h3>国家/地区 Top 10</h3>
                    ${renderReportTable(topCountries, [
                        { key: 'country', label: '国家/地区' },
                        { key: 'count', label: '论文数', format: formatNumber }
                    ])}
                </div>
            </section>

            <section class="report-section">
                <h3>关键词 Top 10</h3>
                ${renderReportTable(topConcepts, [
                    { key: 'concept', label: '关键词' },
                    { key: 'count', label: '论文数', format: formatNumber }
                ])}
            </section>
        </article>
    `;
}

function renderReport() {
    const container = document.getElementById('reportContent');
    if (!container) return;
    container.innerHTML = buildReportHtml();
}

function downloadReport() {
    if (!currentData) {
        alert('请先搜索或上传文献数据');
        return;
    }

    const reportHtml = buildReportHtml();
    const documentHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>PaperHot 文献分析报告</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #263238; margin: 32px; line-height: 1.55; }
        h2, h3 { color: #263238; }
        .report-header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #e5eaf0; margin-bottom: 24px; padding-bottom: 16px; }
        .report-meta { text-align: right; color: #667085; }
        .report-meta span { display: block; font-size: 12px; }
        .report-section { margin: 24px 0; }
        .report-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .report-metrics div { border: 1px solid #dce3ec; border-radius: 8px; padding: 14px; background: #f8fafc; }
        .report-metrics strong { display: block; font-size: 24px; }
        .report-metrics span { color: #667085; }
        .report-summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 24px; margin-top: 16px; }
        .two-column { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th, td { border-bottom: 1px solid #e5eaf0; padding: 8px; text-align: left; vertical-align: top; }
        th { background: #f3f6fb; }
        @media print { body { margin: 16mm; } }
    </style>
</head>
<body>${reportHtml}</body>
</html>`;
    const blob = new Blob([documentHtml], { type: 'text/html;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.href = url;
    a.download = `paperhot_report_${date}.html`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

async function loadNetwork(filename) {
    try {
        const response = await fetch(`${BASE_PATH}/api/network/${encodeFilename(filename)}`);
        const result = await response.json();
        
        if (result.success) {
            currentNetworkData = result.network;
            if (getActiveTabName() === 'network') {
                displayNetwork(currentNetworkData);
            } else if (getActiveTabName() === 'report') {
                renderReport();
            }
        }
    } catch (error) {
        console.error('加载网络数据失败:', error);
    }
}

async function loadCitationNetwork(filename) {
    try {
        const response = await fetch(`${BASE_PATH}/api/citation-network/${encodeFilename(filename)}`);
        const result = await response.json();

        if (result.success) {
            currentCitationNetworkData = result.network;
            if (getActiveTabName() === 'citation') {
                displayCitationNetwork(currentCitationNetworkData);
            } else if (getActiveTabName() === 'report') {
                renderReport();
            }
        }
    } catch (error) {
        console.error('加载引文网络失败:', error);
    }
}

function displayAnalysis(analysis) {
    const totals = analysis.total_stats || {};
    const totalPapers = totals.total_papers ?? analysis.yearly_stats.reduce((sum, y) => sum + y.count, 0);
    const totalCitations = totals.total_citations ?? analysis.yearly_stats.reduce((sum, y) => sum + y.citations, 0);
    const totalJournals = totals.total_journals ?? analysis.journal_stats.length;
    const totalAuthors = totals.total_authors ?? analysis.author_stats.length;
    
    document.getElementById('totalPapers').textContent = totalPapers;
    document.getElementById('totalCitations').textContent = totalCitations.toLocaleString();
    document.getElementById('totalJournals').textContent = totalJournals;
    document.getElementById('totalAuthors').textContent = totalAuthors;
    
    renderTopCitedTable(analysis.citation_stats);
    renderTopCitedAuthorsTable(analysis.top_cited_authors);
    renderChartsForTab(getActiveTabName());
}

function renderTopCitedAuthorsTable(data) {
    const tbody = document.querySelector('#topCitedAuthorsTable tbody');
    tbody.innerHTML = data.map((d, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(d.author)}</td>
            <td>${escapeHtml(d.paper_count)}</td>
            <td>${escapeHtml(d.total_citations)}</td>
            <td>${escapeHtml(d.max_citations)}</td>
            <td>${escapeHtml(d.avg_citations.toFixed(1))}</td>
        </tr>
    `).join('');
}

function renderYearChart(data) {
    const chart = initChart('yearChart', 'yearChart');
    if (!chart) return;
    
    const option = {
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: data.map(d => d.year) },
        yAxis: { type: 'value' },
        series: [{
            data: data.map(d => d.count),
            type: 'line',
            smooth: true,
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(102, 126, 234, 0.8)' },
                    { offset: 1, color: 'rgba(102, 126, 234, 0.1)' }
                ])
            },
            lineStyle: { color: '#667eea', width: 3 },
            itemStyle: { color: '#667eea' }
        }]
    };
    
    chart.setOption(option);
}

function renderJournalChartSmall(data) {
    const chart = initChart('journalChartSmall', 'journalChartSmall');
    if (!chart) return;
    
    const option = {
        tooltip: { trigger: 'item' },
        series: [{
            type: 'pie',
            radius: ['40%', '70%'],
            data: data.map(d => ({ value: d.count, name: d.journal || '未知期刊' })),
            emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' } }
        }]
    };
    
    chart.setOption(option);
}

function renderTopCitedTable(data) {
    const tbody = document.querySelector('#topCitedTable tbody');
    tbody.innerHTML = data.map((d, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(d.title)}</td>
            <td>${escapeHtml(d.authors)}</td>
            <td>${escapeHtml(formatYear(d.year))}</td>
            <td>${escapeHtml(d.cited_by_count)}</td>
        </tr>
    `).join('');
}

function renderTrendChart(data) {
    const chart = initChart('trendChart', 'trendChart');
    if (!chart) return;
    
    const option = {
        tooltip: { trigger: 'axis' },
        legend: { data: ['发表数量', '被引频次'] },
        xAxis: { type: 'category', data: data.map(d => d.year) },
        yAxis: [{ type: 'value', name: '发表数量' }, { type: 'value', name: '被引频次' }],
        series: [
            {
                name: '发表数量',
                type: 'bar',
                data: data.map(d => d.count),
                itemStyle: { color: '#667eea' }
            },
            {
                name: '被引频次',
                type: 'line',
                yAxisIndex: 1,
                data: data.map(d => d.citations),
                smooth: true,
                itemStyle: { color: '#764ba2' }
            }
        ]
    };
    
    chart.setOption(option);
}

function renderJournalChart(data) {
    setChartHeight('journalChart', data.length);
    const chart = initChart('journalChart', 'journalChart');
    if (!chart) return;
    
    const option = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'value' },
        yAxis: {
            type: 'category',
            data: data.map(d => d.journal || '未知期刊').reverse(),
            axisLabel: { interval: 0, width: 220, overflow: 'truncate' }
        },
        series: [{
            type: 'bar',
            data: data.map(d => d.count).reverse(),
            itemStyle: { color: '#667eea' }
        }]
    };
    
    chart.setOption(option);
}

function renderCountryChart(data) {
    setChartHeight('countryChart', data.length);
    const chart = initChart('countryChart', 'countryChart');
    if (!chart) return;
    
    const option = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: data.map(d => d.country).reverse(), axisLabel: { interval: 0 } },
        series: [{
            type: 'bar',
            data: data.map(d => d.count).reverse(),
            itemStyle: { color: '#764ba2' }
        }]
    };
    
    chart.setOption(option);
}

function renderAuthorChart(data) {
    setChartHeight('authorChart', data.length, 420, 24);
    const chart = initChart('authorChart', 'authorChart');
    if (!chart) return;
    
    const option = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'value' },
        yAxis: {
            type: 'category',
            data: data.map(d => d.author).reverse(),
            axisLabel: { interval: 0, fontSize: 11, width: 190, overflow: 'truncate' }
        },
        series: [{
            type: 'bar',
            data: data.map(d => d.count).reverse(),
            itemStyle: { color: '#667eea' }
        }]
    };
    
    chart.setOption(option);
}

function renderConceptChart(data) {
    setChartHeight('conceptChart', data.length);
    const chart = initChart('conceptChart', 'conceptChart');
    if (!chart) return;
    
    const option = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'value' },
        yAxis: {
            type: 'category',
            data: data.map(d => d.concept).reverse(),
            axisLabel: { interval: 0, width: 220, overflow: 'truncate' }
        },
        series: [{
            type: 'bar',
            data: data.map(d => d.count).reverse(),
            itemStyle: { 
                color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                    { offset: 0, color: '#667eea' },
                    { offset: 1, color: '#764ba2' }
                ])
            }
        }]
    };
    
    chart.setOption(option);
}

function disposeChart(chartKey) {
    if (!charts[chartKey]) return;
    try {
        charts[chartKey].dispose();
    } catch (error) {
        console.warn(`释放图表 ${chartKey} 失败:`, error);
    }
    delete charts[chartKey];
}

function renderSvgNetwork(chartId, nodes, edges, options = {}) {
    const container = document.getElementById(chartId);
    if (!container) return;

    disposeChart(chartId);
    container.replaceChildren();

    if (!nodes.length) {
        container.innerHTML = '<div class="chart-placeholder">当前没有可显示的节点</div>';
        return;
    }

    const width = 1100;
    const height = 540;
    const maxNodes = options.maxNodes || 80;
    const labelKey = options.labelKey || 'name';
    const nodeColor = options.nodeColor || '#2e7d59';
    const minRadius = options.minRadius ?? 10;
    const maxRadius = options.maxRadius ?? 40;
    const visibleNodes = [...nodes]
        .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))
        .slice(0, maxNodes);
    const visibleIds = new Set(visibleNodes.map(node => String(node.id)));
    const visibleEdges = edges.filter(edge => visibleIds.has(String(edge.source)) && visibleIds.has(String(edge.target)));
    const maxValue = Math.max(1, ...visibleNodes.map(node => Number(node.value) || 0));
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('class', 'svg-network');
    svg.setAttribute('role', 'img');

    const defs = document.createElementNS(svgNs, 'defs');
    const marker = document.createElementNS(svgNs, 'marker');
    marker.setAttribute('id', `${chartId}Arrow`);
    marker.setAttribute('markerWidth', '10');
    marker.setAttribute('markerHeight', '10');
    marker.setAttribute('refX', '8');
    marker.setAttribute('refY', '3');
    marker.setAttribute('orient', 'auto');
    marker.setAttribute('markerUnits', 'strokeWidth');
    const arrowPath = document.createElementNS(svgNs, 'path');
    arrowPath.setAttribute('d', 'M0,0 L0,6 L9,3 z');
    arrowPath.setAttribute('fill', '#7b8794');
    marker.appendChild(arrowPath);
    defs.appendChild(marker);
    svg.appendChild(defs);

    const centerX = width / 2;
    const centerY = height / 2;
    const baseRadius = Math.min(width, height) * 0.35;
    const positions = new Map();

    visibleNodes.forEach((node, index) => {
        const angle = (Math.PI * 2 * index / visibleNodes.length) - Math.PI / 2;
        const ringOffset = visibleNodes.length > 18 ? ((index % 3) - 1) * 34 : 0;
        const radius = baseRadius + ringOffset;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        const value = Number(node.value) || 0;
        const nodeRadius = minRadius + (Math.sqrt(value) / Math.sqrt(maxValue)) * (maxRadius - minRadius);
        positions.set(String(node.id), { x, y, radius: nodeRadius });
    });

    const edgeGroup = document.createElementNS(svgNs, 'g');
    edgeGroup.setAttribute('class', 'svg-network-edges');
    visibleEdges.forEach(edge => {
        const source = positions.get(String(edge.source));
        const target = positions.get(String(edge.target));
        if (!source || !target) return;

        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const startX = source.x + (dx / distance) * source.radius;
        const startY = source.y + (dy / distance) * source.radius;
        const endX = target.x - (dx / distance) * (target.radius + 4);
        const endY = target.y - (dy / distance) * (target.radius + 4);

        const line = document.createElementNS(svgNs, 'line');
        line.setAttribute('x1', startX);
        line.setAttribute('y1', startY);
        line.setAttribute('x2', endX);
        line.setAttribute('y2', endY);
        line.setAttribute('class', options.directed ? 'svg-network-edge directed' : 'svg-network-edge');
        if (options.directed) {
            line.setAttribute('marker-end', `url(#${chartId}Arrow)`);
        }
        edgeGroup.appendChild(line);
    });
    svg.appendChild(edgeGroup);

    const nodeGroup = document.createElementNS(svgNs, 'g');
    visibleNodes.forEach(node => {
        const position = positions.get(String(node.id));
        if (!position) return;

        const group = document.createElementNS(svgNs, 'g');
        group.setAttribute('class', 'svg-network-node');

        const label = node[labelKey] || node.title || node.name || '无标题';
        const title = document.createElementNS(svgNs, 'title');
        title.textContent = node.tooltip || `${label}\n${options.valueLabel || '数量'}: ${node.value || 0}`;
        group.appendChild(title);

        const circle = document.createElementNS(svgNs, 'circle');
        circle.setAttribute('cx', position.x);
        circle.setAttribute('cy', position.y);
        circle.setAttribute('r', position.radius);
        circle.setAttribute('fill', nodeColor);
        circle.setAttribute('class', 'svg-network-circle');
        group.appendChild(circle);

        const text = document.createElementNS(svgNs, 'text');
        if (options.labelInside) {
            text.setAttribute('x', position.x);
            text.setAttribute('y', position.y + 3);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('class', 'svg-network-label inside');
            text.textContent = node.shortLabel || (label.length > 8 ? `${label.slice(0, 8)}...` : label);
        } else {
            text.setAttribute('x', position.x + position.radius + 6);
            text.setAttribute('y', position.y + 4);
            text.setAttribute('class', 'svg-network-label');
            text.textContent = label.length > 30 ? `${label.slice(0, 30)}...` : label;
        }
        group.appendChild(text);

        nodeGroup.appendChild(group);
    });
    svg.appendChild(nodeGroup);

    container.appendChild(svg);
    if (nodes.length > visibleNodes.length) {
        const note = document.createElement('div');
        note.className = 'svg-network-note';
        note.textContent = `图表库未加载，已用备用图显示最高 ${visibleNodes.length} 个节点。`;
        container.appendChild(note);
    }
}

function displayNetwork(data) {
    if (typeof echarts === 'undefined') {
        renderSvgNetwork('networkChart', data.nodes || [], data.edges || [], {
            nodeColor: '#667eea',
            valueLabel: '合作次数'
        });
        return;
    }

    const chart = initChart('networkChart', 'networkChart');
    if (!chart) {
        renderSvgNetwork('networkChart', data.nodes || [], data.edges || [], {
            nodeColor: '#667eea',
            valueLabel: '合作次数'
        });
        return;
    }
    
    const categories = [{ name: '作者' }];
    
    const option = {
        tooltip: {},
        legend: { data: ['作者'] },
        series: [{
            name: '作者合作',
            type: 'graph',
            layout: 'force',
            data: data.nodes.map(n => ({ ...n, category: 0, symbolSize: Math.sqrt(n.value) * 5 })),
            links: data.edges,
            categories: categories,
            roam: true,
            label: { show: true, position: 'right', formatter: '{b}', fontSize: 10 },
            lineStyle: { color: 'source', curveness: 0.3 },
            force: { repulsion: 200, edgeLength: 100 }
        }]
    };
    
    chart.setOption(option);
}

function limitCitationNetwork(nodes, edges, limit) {
    const visibleNodes = [...nodes]
        .sort((a, b) => {
            const citationDelta = (Number(b.value) || 0) - (Number(a.value) || 0);
            if (citationDelta !== 0) return citationDelta;
            return String(a.title || a.name || '').localeCompare(String(b.title || b.name || ''));
        })
        .slice(0, Math.min(limit, nodes.length));
    const visibleKeys = new Set();

    visibleNodes.forEach(node => {
        if (node.id !== undefined && node.id !== null) {
            visibleKeys.add(String(node.id));
        }
        if (node.name) visibleKeys.add(String(node.name));
        if (node.title) visibleKeys.add(String(node.title));
    });

    const visibleEdges = edges.filter(edge => (
        visibleKeys.has(String(edge.source)) && visibleKeys.has(String(edge.target))
    ));

    return { nodes: visibleNodes, edges: visibleEdges };
}

function buildCitationGraphData(nodes, edges) {
    const usedNames = new Map();
    const usedLabels = new Map();
    const nameByKey = new Map();
    const maxCitations = Math.max(1, ...nodes.map(node => Number(node.value) || 0));

    const graphNodes = nodes.map((node, index) => {
        const title = node.title || node.name || `无标题 ${index + 1}`;
        const shortTitle = title.length > 42 ? `${title.slice(0, 42)}...` : title;
        const year = formatYear(node.year);
        const baseName = year ? `${shortTitle} (${year})` : shortTitle;
        const useCount = usedNames.get(baseName) || 0;
        usedNames.set(baseName, useCount + 1);
        const graphName = useCount ? `${baseName} #${useCount + 1}` : baseName;
        const baseShortLabel = abbreviatePaperTitle(title, index);
        const labelUseCount = usedLabels.get(baseShortLabel) || 0;
        usedLabels.set(baseShortLabel, labelUseCount + 1);
        const shortLabel = labelUseCount ? `${baseShortLabel}${labelUseCount + 1}` : baseShortLabel;
        const citationCount = Number(node.value) || 0;
        const symbolSize = 12 + (Math.sqrt(citationCount) / Math.sqrt(maxCitations)) * 18;

        if (node.id !== undefined && node.id !== null) {
            nameByKey.set(String(node.id), graphName);
        }
        if (node.name) {
            nameByKey.set(String(node.name), graphName);
        }
        if (node.title) {
            nameByKey.set(String(node.title), graphName);
        }
        nameByKey.set(graphName, graphName);

        return {
            ...node,
            id: graphName,
            name: graphName,
            shortLabel,
            fullLabel: title,
            tooltip: [
                title,
                node.authors || '',
                `${node.journal || ''} ${year}`.trim(),
                `总被引: ${citationCount}`,
                `集合内被引: ${node.internal_citations || 0}`,
                `已补全参考文献: ${node.resolved_references || 0}`
            ].filter(Boolean).join('\n'),
            category: 0,
            symbolSize
        };
    });
    const graphNodeNames = new Set(graphNodes.map(node => node.name));

    const graphEdges = edges
        .map(edge => ({
            ...edge,
            source: nameByKey.get(String(edge.source)) || edge.source,
            target: nameByKey.get(String(edge.target)) || edge.target
        }))
        .filter(edge => graphNodeNames.has(edge.source) && graphNodeNames.has(edge.target));

    return { nodes: graphNodes, edges: graphEdges };
}

function displayCitationNetwork(data) {
    const summary = document.getElementById('citationNetworkSummary');
    const chartDom = document.getElementById('citationNetworkChart');
    const nodes = data.nodes || [];
    const edges = data.edges || [];
    const limit = getCitationDisplayLimit();
    const visibleNetwork = limitCitationNetwork(nodes, edges, limit);
    const visibleNodes = visibleNetwork.nodes;
    const visibleEdges = visibleNetwork.edges;
    const hasEdges = visibleEdges.length > 0;
    const visibleCountText = visibleNodes.length < nodes.length
        ? `显示按被引排序前 ${visibleNodes.length} / ${nodes.length} 篇文章`
        : `显示全部 ${nodes.length} 篇文章`;
    summary.textContent = hasEdges
        ? `${visibleCountText}，图中 ${visibleEdges.length} / ${edges.length} 条集合内部引用关系`
        : `${visibleCountText}，当前显示范围内暂未识别到集合内部引用关系；节点仍按总被引数显示`;

    renderCitationDetails(visibleNodes, visibleEdges);

    if (!nodes.length) {
        if (charts.citationNetworkChart) {
            try {
                charts.citationNetworkChart.dispose();
            } catch (error) {
                console.warn('释放引文网络图表失败:', error);
            }
            delete charts.citationNetworkChart;
        }
        chartDom.innerHTML = '<div class="chart-placeholder">当前集合没有可显示的文章</div>';
        return;
    }

    const graphData = buildCitationGraphData(visibleNodes, visibleEdges);

    if (typeof echarts === 'undefined') {
        renderSvgNetwork('citationNetworkChart', graphData.nodes, graphData.edges, {
            directed: true,
            labelKey: 'name',
            labelInside: true,
            minRadius: 8,
            maxRadius: 22,
            nodeColor: '#2e7d59',
            valueLabel: '被引'
        });
        return;
    }

    const chart = initChart('citationNetworkChart', 'citationNetworkChart');
    if (!chart) {
        renderSvgNetwork('citationNetworkChart', graphData.nodes, graphData.edges, {
            directed: true,
            labelKey: 'name',
            labelInside: true,
            minRadius: 8,
            maxRadius: 22,
            nodeColor: '#2e7d59',
            valueLabel: '被引'
        });
        return;
    }

    const option = {
        tooltip: {
            confine: true,
            extraCssText: 'max-width: 360px; white-space: normal; line-height: 1.45;',
            formatter: (params) => {
                if (params.dataType === 'edge') return '引用关系';
                const item = params.data || {};
                return `
                    <strong>${escapeHtml(item.fullLabel || item.title || item.name || '')}</strong><br/>
                    缩写: ${escapeHtml(item.shortLabel || '')}<br/>
                    ${escapeHtml(item.authors || '')}<br/>
                    ${escapeHtml(item.journal || '')} ${escapeHtml(formatYear(item.year))}<br/>
                    被引: ${escapeHtml(item.value || 0)}；集合内被引: ${escapeHtml(item.internal_citations || 0)}<br/>
                    已补全参考文献: ${escapeHtml(item.resolved_references || 0)}
                `;
            }
        },
        legend: { data: ['论文'] },
        series: [{
            name: '论文引用',
            type: 'graph',
            layout: 'force',
            data: graphData.nodes,
            links: graphData.edges,
            categories: [{ name: '论文' }],
            roam: true,
            draggable: true,
            edgeSymbol: ['none', 'arrow'],
            edgeSymbolSize: 8,
            label: {
                show: true,
                position: 'inside',
                formatter: (params) => params.data.shortLabel || '',
                fontSize: 8,
                fontWeight: 700,
                color: '#ffffff'
            },
            emphasis: {
                focus: 'adjacency',
                label: {
                    show: true,
                    position: 'right',
                    formatter: (params) => params.data.fullLabel || params.data.name,
                    fontSize: 11,
                    color: '#263238',
                    backgroundColor: 'rgba(255, 255, 255, 0.92)',
                    borderColor: '#d7dee8',
                    borderWidth: 1,
                    borderRadius: 4,
                    padding: [3, 5],
                    width: 260,
                    overflow: 'truncate'
                }
            },
            lineStyle: {
                color: 'source',
                curveness: 0.3
            },
            force: {
                repulsion: 200,
                edgeLength: 100
            }
        }]
    };

    chart.setOption(option);
    chart.resize();
}

function renderCitationDetails(nodes, edges) {
    const container = document.getElementById('citationNetworkDetails');
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const topNodes = [...nodes]
        .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))
        .slice(0, 12);
    const edgeItems = edges.slice(0, 20);
    const referenceDetails = [];
    nodes.forEach(node => {
        (node.reference_details || []).slice(0, 5).forEach(reference => {
            referenceDetails.push({ source: node, reference });
        });
    });

    const paperItems = topNodes.map(node => `
        <div class="citation-detail-item">
            <strong>${escapeHtml(node.title || node.name || '无标题')}</strong>
            <div class="citation-detail-meta">被引 ${escapeHtml(node.value || 0)} · 集合内被引 ${escapeHtml(node.internal_citations || 0)} · ${escapeHtml(formatYear(node.year))}</div>
        </div>
    `).join('');

    const edgeHtml = edgeItems.length
        ? edgeItems.map(edge => {
            const source = nodeById.get(edge.source);
            const target = nodeById.get(edge.target);
            return `
                <div class="citation-detail-item">
                    ${escapeHtml(source?.title || source?.name || edge.source)}
                    <div class="citation-detail-meta">引用 → ${escapeHtml(target?.title || target?.name || edge.target)}</div>
                </div>
            `;
        }).join('')
        : '<div class="citation-detail-item">当前集合内部没有匹配到引用边，但上方仍显示论文节点。</div>';

    const referenceHtml = referenceDetails.slice(0, 20).map(item => `
        <div class="citation-detail-item">
            <strong>${escapeHtml(item.reference.title || item.reference.id || '未知引用')}</strong>
            <div class="citation-detail-meta">
                ${escapeHtml(formatYear(item.reference.year))} · ${escapeHtml(item.reference.journal || '')} · ${escapeHtml(item.reference.authors || '')}
            </div>
            <div class="citation-detail-meta">来自：${escapeHtml(item.source.title || item.source.name || '')}</div>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="citation-detail-panel">
            <h5>高被引节点</h5>
            <div class="citation-detail-list">${paperItems || '<div class="citation-detail-item">没有论文节点</div>'}</div>
        </div>
        <div class="citation-detail-panel">
            <h5>集合内引用关系</h5>
            <div class="citation-detail-list">${edgeHtml}</div>
        </div>
        <div class="citation-detail-panel">
            <h5>已补全参考文献</h5>
            <div class="citation-detail-list">${referenceHtml || '<div class="citation-detail-item">还没有补全的参考文献信息</div>'}</div>
        </div>
    `;
}

function switchTab(tabName, options = {}) {
    console.log('切换到标签:', tabName);
    
    // 移除所有激活状态
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // 添加当前标签的激活状态
    const tabBtn = document.querySelector(`[data-tab="${tabName}"]`);
    const tabContent = document.getElementById(`${tabName}Tab`);
    
    if (tabBtn) {
        tabBtn.classList.add('active');
    }
    if (tabContent) {
        tabContent.classList.add('active');
        if (tabName !== 'overview') {
            tabContent.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
    }
    
    setTimeout(() => {
        renderChartsForTab(tabName);
        Object.values(charts).forEach(chart => {
            if (chart && typeof chart.resize === 'function') {
                chart.resize();
            }
        });
    }, 100);

    if (!options.skipSave) {
        saveAppState({ activeTab: tabName });
    }
}

function showStatus(icon, text) {
    document.getElementById('statusSection').style.display = 'block';
    document.getElementById('statusIcon').textContent = icon;
    document.getElementById('statusText').textContent = text;
}

function hideStatus() {
    document.getElementById('statusSection').style.display = 'none';
}

window.addEventListener('resize', () => {
    Object.values(charts).forEach(chart => chart && chart.resize());
});
