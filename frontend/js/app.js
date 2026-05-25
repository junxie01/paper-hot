const BASE_PATH = '/paper-hot';
let currentFilename = null;
let currentData = null;
let currentPapers = [];
let filteredPapers = [];
let selectedPaperIndices = new Set();
let titleSearchResults = [];
let charts = {};

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('searchBtn').addEventListener('click', searchPapers);
    document.getElementById('uploadBtn').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
    document.getElementById('uploadArea').addEventListener('click', () => document.getElementById('fileInput').click());
    document.getElementById('authorCount').addEventListener('change', reloadAuthorChart);
    document.getElementById('downloadAllBtn').addEventListener('click', downloadAllPapers);
    document.getElementById('papersList').addEventListener('click', handleDownloadListClick);
    document.getElementById('paperTextFilter').addEventListener('input', applyPaperFilters);
    document.getElementById('paperStartYearFilter').addEventListener('input', applyPaperFilters);
    document.getElementById('paperEndYearFilter').addEventListener('input', applyPaperFilters);
    document.getElementById('paperOaFilter').addEventListener('change', applyPaperFilters);
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
    
    if (!keyword) {
        alert('请输入关键词');
        return;
    }
    
    showStatus('⏳', '正在搜索文献...');
    
    try {
        const response = await fetch(`${BASE_PATH}/api/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword, max_results: maxResults, start_year: startYear, end_year: endYear })
        });
        
        const result = await response.json();
        
        if (result.success) {
            currentFilename = result.csv_path.split('/').pop();
            currentData = result.papers;
            
            showStatus('✅', `成功获取 ${result.count} 篇文献！`);
            setTimeout(() => {
                hideStatus();
                loadAnalysis(currentFilename);
            }, 1500);
        }
    } catch (error) {
        showStatus('❌', '搜索失败: ' + error.message);
    }
}

async function loadAnalysis(filename) {
    currentFilename = filename;
    
    showStatus('⏳', '正在分析数据...');
    
    try {
        const authorCount = parseInt(document.getElementById('authorCount').value) || 50;
        const response = await fetch(`${BASE_PATH}/api/analysis/${encodeFilename(filename)}?author_count=${authorCount}`);
        const result = await response.json();
        
        if (result.success) {
            currentData = result.analysis;
            displayAnalysis(result.analysis);
            loadNetwork(filename);
            loadCitationNetwork(filename);
            loadPapersList(filename);
            hideStatus();
            document.getElementById('tabsSection').style.display = 'block';
            document.getElementById('contentSection').style.display = 'block';
        }
    } catch (error) {
        showStatus('❌', '分析失败: ' + error.message);
    }
}

async function reloadAuthorChart() {
    if (!currentFilename || !currentData) return;
    
    const authorCount = parseInt(document.getElementById('authorCount').value) || 50;
    
    try {
        const response = await fetch(`${BASE_PATH}/api/analysis/${encodeFilename(currentFilename)}?author_count=${authorCount}`);
        const result = await response.json();
        
        if (result.success) {
            renderAuthorChart(result.analysis.author_stats);
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
        }
    } catch (error) {
        console.error('加载论文列表失败:', error);
    }
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
}

function clearPaperFilters() {
    document.getElementById('paperTextFilter').value = '';
    document.getElementById('paperStartYearFilter').value = '';
    document.getElementById('paperEndYearFilter').value = '';
    document.getElementById('paperOaFilter').value = 'all';
    applyPaperFilters();
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
        status.textContent = `找到 ${titleSearchResults.length} 个候选结果`;
        renderTitleSearchResults();
    } catch (error) {
        status.textContent = '搜索失败: ' + error.message;
    }
}

function renderTitleSearchResults() {
    const container = document.getElementById('titleSearchResults');
    if (!titleSearchResults.length) {
        container.innerHTML = '<div class="muted-cell">没有候选结果</div>';
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

async function loadNetwork(filename) {
    try {
        const response = await fetch(`${BASE_PATH}/api/network/${encodeFilename(filename)}`);
        const result = await response.json();
        
        if (result.success) {
            displayNetwork(result.network);
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
            displayCitationNetwork(result.network);
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
    
    renderYearChart(analysis.yearly_stats);
    renderJournalChartSmall(analysis.journal_stats.slice(0, 10));
    renderTopCitedTable(analysis.citation_stats);
    renderTrendChart(analysis.yearly_stats);
    renderJournalChart(analysis.journal_stats);
    renderCountryChart(analysis.country_stats);
    renderAuthorChart(analysis.author_stats);
    renderTopCitedAuthorsTable(analysis.top_cited_authors);
    renderConceptChart(analysis.concept_stats);
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
    const chartDom = document.getElementById('yearChart');
    if (charts.yearChart) charts.yearChart.dispose();
    
    charts.yearChart = echarts.init(chartDom);
    
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
    
    charts.yearChart.setOption(option);
}

function renderJournalChartSmall(data) {
    const chartDom = document.getElementById('journalChartSmall');
    if (charts.journalChartSmall) charts.journalChartSmall.dispose();
    
    charts.journalChartSmall = echarts.init(chartDom);
    
    const option = {
        tooltip: { trigger: 'item' },
        series: [{
            type: 'pie',
            radius: ['40%', '70%'],
            data: data.map(d => ({ value: d.count, name: d.journal || '未知期刊' })),
            emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' } }
        }]
    };
    
    charts.journalChartSmall.setOption(option);
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
    const chartDom = document.getElementById('trendChart');
    if (charts.trendChart) charts.trendChart.dispose();
    
    charts.trendChart = echarts.init(chartDom);
    
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
    
    charts.trendChart.setOption(option);
}

function renderJournalChart(data) {
    const chartDom = document.getElementById('journalChart');
    if (charts.journalChart) charts.journalChart.dispose();
    
    charts.journalChart = echarts.init(chartDom);
    
    const option = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: data.map(d => d.journal || '未知期刊').reverse() },
        series: [{
            type: 'bar',
            data: data.map(d => d.count).reverse(),
            itemStyle: { color: '#667eea' }
        }]
    };
    
    charts.journalChart.setOption(option);
}

function renderCountryChart(data) {
    const chartDom = document.getElementById('countryChart');
    if (charts.countryChart) charts.countryChart.dispose();
    
    charts.countryChart = echarts.init(chartDom);
    
    const option = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: data.map(d => d.country).reverse() },
        series: [{
            type: 'bar',
            data: data.map(d => d.count).reverse(),
            itemStyle: { color: '#764ba2' }
        }]
    };
    
    charts.countryChart.setOption(option);
}

function renderAuthorChart(data) {
    const chartDom = document.getElementById('authorChart');
    if (charts.authorChart) charts.authorChart.dispose();
    
    charts.authorChart = echarts.init(chartDom);
    
    const option = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: data.map(d => d.author).reverse(), axisLabel: { interval: 0, fontSize: 10 } },
        series: [{
            type: 'bar',
            data: data.map(d => d.count).reverse(),
            itemStyle: { color: '#667eea' }
        }]
    };
    
    charts.authorChart.setOption(option);
}

function renderConceptChart(data) {
    const chartDom = document.getElementById('conceptChart');
    if (charts.conceptChart) charts.conceptChart.dispose();
    
    charts.conceptChart = echarts.init(chartDom);
    
    const option = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: data.map(d => d.concept).reverse() },
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
    
    charts.conceptChart.setOption(option);
}

function displayNetwork(data) {
    const chartDom = document.getElementById('networkChart');
    if (charts.networkChart) charts.networkChart.dispose();
    
    charts.networkChart = echarts.init(chartDom);
    
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
    
    charts.networkChart.setOption(option);
}

function displayCitationNetwork(data) {
    const chartDom = document.getElementById('citationNetworkChart');
    const summary = document.getElementById('citationNetworkSummary');
    if (charts.citationNetworkChart) charts.citationNetworkChart.dispose();

    charts.citationNetworkChart = echarts.init(chartDom);

    const nodes = data.nodes || [];
    const edges = data.edges || [];
    const maxCitations = Math.max(1, ...nodes.map(node => Number(node.value) || 0));
    summary.textContent = `当前集合内 ${nodes.length} 篇文章，识别到 ${edges.length} 条集合内部引用关系`;

    const option = {
        tooltip: {
            formatter: (params) => {
                if (params.dataType === 'edge') return '引用关系';
                const data = params.data || {};
                return `
                    <strong>${escapeHtml(data.title || data.name || '')}</strong><br/>
                    ${escapeHtml(data.authors || '')}<br/>
                    ${escapeHtml(data.journal || '')} ${escapeHtml(formatYear(data.year))}<br/>
                    被引: ${escapeHtml(data.value || 0)}；集合内被引: ${escapeHtml(data.internal_citations || 0)}
                `;
            }
        },
        series: [{
            name: '引文网络',
            type: 'graph',
            layout: 'force',
            data: nodes.map(node => ({
                ...node,
                symbolSize: 10 + (Math.sqrt(Number(node.value) || 0) / Math.sqrt(maxCitations)) * 44
            })),
            links: edges,
            roam: true,
            draggable: true,
            edgeSymbol: ['none', 'arrow'],
            edgeSymbolSize: 8,
            label: { show: false },
            emphasis: {
                focus: 'adjacency',
                label: { show: true, formatter: '{b}', fontSize: 10 }
            },
            lineStyle: {
                color: '#777',
                width: 1,
                opacity: 0.55,
                curveness: 0.18
            },
            itemStyle: { color: '#2e7d59' },
            force: { repulsion: 260, edgeLength: 140 }
        }]
    };

    charts.citationNetworkChart.setOption(option);
}

function switchTab(tabName) {
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
    }
    
    setTimeout(() => {
        Object.values(charts).forEach(chart => {
            if (chart && typeof chart.resize === 'function') {
                chart.resize();
            }
        });
    }, 100);
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
