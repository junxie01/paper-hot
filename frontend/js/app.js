const BASE_PATH = '/paper-hot';
let currentFilename = null;
let currentData = null;
let currentPapers = [];
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

async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        await uploadFile(file);
    }
}

async function uploadFile(file) {
    if (!file.name.endsWith('.csv')) {
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
        const response = await fetch(`${BASE_PATH}/api/analysis/${filename}?author_count=${authorCount}`);
        const result = await response.json();
        
        if (result.success) {
            currentData = result.analysis;
            displayAnalysis(result.analysis);
            loadNetwork(filename);
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
        const response = await fetch(`${BASE_PATH}/api/analysis/${currentFilename}?author_count=${authorCount}`);
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
        const response = await fetch(`${BASE_PATH}/api/papers/${filename}`);
        const result = await response.json();
        
        if (result.success) {
            currentPapers = result.papers;
            displayPapersList(result.papers);
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
                <div class="paper-title">${paper.title || '无标题'}</div>
                <div class="paper-authors">${paper.authors || '无作者'}</div>
            </div>
            ${paper.has_pdf 
                ? `<button class="paper-btn download" onclick="downloadSinglePaper('${paper.pdf_url}', '${paper.title}')">下载PDF</button>`
                : `<button class="paper-btn unavailable" disabled>不可下载</button>`
            }
        </div>
    `).join('');
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
        const response = await fetch(`${BASE_PATH}/api/download/${currentFilename}`, { method: 'POST' });
        
        if (!response.ok) {
            throw new Error('下载失败');
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
        const response = await fetch(`${BASE_PATH}/api/network/${filename}`);
        const result = await response.json();
        
        if (result.success) {
            displayNetwork(result.network);
        }
    } catch (error) {
        console.error('加载网络数据失败:', error);
    }
}

function displayAnalysis(analysis) {
    const totalPapers = analysis.yearly_stats.reduce((sum, y) => sum + y.count, 0);
    const totalCitations = analysis.yearly_stats.reduce((sum, y) => sum + y.citations, 0);
    const totalJournals = analysis.journal_stats.length;
    const totalAuthors = analysis.author_stats.length;
    
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
            <td>${d.author}</td>
            <td>${d.paper_count}</td>
            <td>${d.total_citations}</td>
            <td>${d.max_citations}</td>
            <td>${d.avg_citations.toFixed(1)}</td>
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
            <td>${d.title}</td>
            <td>${d.authors}</td>
            <td>${d.year}</td>
            <td>${d.cited_by_count}</td>
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
