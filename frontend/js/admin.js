const BASE_PATH = '/paper-hot';
const ADMIN_PASSWORD_KEY = 'paperHot.adminPassword';
const APP_STATE_KEY = 'paperHot.currentState';

let adminPassword = sessionStorage.getItem(ADMIN_PASSWORD_KEY) || '';
let adminFiles = [];

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('adminLoginBtn').addEventListener('click', handleAdminLogin);
    document.getElementById('adminPassword').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') handleAdminLogin();
    });
    document.getElementById('adminRefreshBtn').addEventListener('click', loadAdminFiles);
    document.getElementById('adminLogoutBtn').addEventListener('click', logoutAdmin);
    document.getElementById('adminFilesBody').addEventListener('click', handleAdminTableClick);

    if (adminPassword) {
        document.getElementById('adminPassword').value = adminPassword;
        showAdminWorkspace();
        loadAdminFiles();
    }
});

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function encodePart(value) {
    return encodeURIComponent(value);
}

function formatBytes(bytes) {
    const number = Number(bytes) || 0;
    if (number < 1024) return `${number} B`;
    if (number < 1024 * 1024) return `${(number / 1024).toFixed(1)} KB`;
    return `${(number / 1024 / 1024).toFixed(1)} MB`;
}

function setAdminStatus(message, type = '') {
    const status = document.getElementById('adminStatus');
    status.textContent = message;
    status.className = `admin-status ${type}`.trim();
}

function showAdminWorkspace() {
    document.getElementById('adminLogin').style.display = 'none';
    document.getElementById('adminToolbar').style.display = 'flex';
    document.getElementById('adminTableWrap').style.display = 'block';
}

function hideAdminWorkspace() {
    document.getElementById('adminLogin').style.display = 'flex';
    document.getElementById('adminToolbar').style.display = 'none';
    document.getElementById('adminTableWrap').style.display = 'none';
}

function getAdminHeaders(extra = {}) {
    return {
        ...extra,
        'X-PaperHot-Admin-Password': adminPassword,
    };
}

async function parseAdminResponse(response) {
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
        throw new Error(result.detail || result.message || '操作失败');
    }
    return result;
}

async function handleAdminLogin() {
    const value = document.getElementById('adminPassword').value;
    if (!value) {
        setAdminStatus('请输入管理员密码', 'error');
        return;
    }
    adminPassword = value;
    sessionStorage.setItem(ADMIN_PASSWORD_KEY, adminPassword);
    showAdminWorkspace();
    await loadAdminFiles();
}

function logoutAdmin() {
    adminPassword = '';
    adminFiles = [];
    sessionStorage.removeItem(ADMIN_PASSWORD_KEY);
    document.getElementById('adminPassword').value = '';
    document.getElementById('adminFilesBody').innerHTML = '';
    document.getElementById('adminSummary').textContent = '';
    setAdminStatus('');
    hideAdminWorkspace();
}

async function loadAdminFiles() {
    setAdminStatus('正在读取 CSV 文件...');
    try {
        const response = await fetch(`${BASE_PATH}/api/admin/files`, {
            headers: getAdminHeaders(),
        });
        const result = await parseAdminResponse(response);
        adminFiles = result.files || [];
        renderAdminFiles();
        setAdminStatus(adminFiles.length ? '已加载 CSV 文件' : '服务器上还没有 CSV 文件', 'success');
    } catch (error) {
        setAdminStatus(error.message, 'error');
        if (String(error.message).includes('Invalid admin password')) {
            logoutAdmin();
        }
    }
}

function renderAdminFiles() {
    const body = document.getElementById('adminFilesBody');
    const summary = document.getElementById('adminSummary');
    summary.textContent = `共 ${adminFiles.length} 个 CSV 文件`;

    if (!adminFiles.length) {
        body.innerHTML = '<tr><td colspan="6" class="muted-cell">没有 CSV 文件</td></tr>';
        return;
    }

    body.innerHTML = adminFiles.map((file, index) => `
        <tr>
            <td>
                <div>${escapeHtml(file.owner_label)}</div>
                <div class="muted-cell">${escapeHtml(file.owner_id)}</div>
            </td>
            <td>${escapeHtml(file.filename)}</td>
            <td>${escapeHtml(file.rows)}</td>
            <td>${escapeHtml(formatBytes(file.size))}</td>
            <td>${escapeHtml(file.modified_at)}</td>
            <td>
                <div class="admin-row-actions">
                    <button class="btn btn-primary btn-small admin-copy-btn" data-index="${index}">复制分析</button>
                    <button class="btn btn-secondary btn-small admin-download-btn" data-index="${index}">下载</button>
                    <button class="btn btn-danger btn-small admin-delete-btn" data-index="${index}">删除</button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function handleAdminTableClick(event) {
    const button = event.target.closest('button[data-index]');
    if (!button) return;

    const index = Number(button.dataset.index);
    const file = adminFiles[index];
    if (!file) return;

    if (button.classList.contains('admin-copy-btn')) {
        await copyFileToCurrentSession(file);
    } else if (button.classList.contains('admin-download-btn')) {
        await downloadAdminCsv(file);
    } else if (button.classList.contains('admin-delete-btn')) {
        await deleteAdminCsv(file);
    }
}

async function copyFileToCurrentSession(file) {
    setAdminStatus('正在复制到当前会话...');
    try {
        const response = await fetch(
            `${BASE_PATH}/api/admin/files/${encodePart(file.owner_id)}/${encodePart(file.filename)}/copy`,
            {
                method: 'POST',
                headers: getAdminHeaders(),
            }
        );
        const result = await parseAdminResponse(response);
        localStorage.setItem(APP_STATE_KEY, JSON.stringify({
            filename: result.filename,
            activeTab: 'overview',
            filters: { text: '', startYear: '', endYear: '', oa: 'all' },
            authorCount: '50',
            citationLimit: '50',
        }));
        setAdminStatus('已复制到当前会话，正在打开分析页面...', 'success');
        window.location.href = BASE_PATH;
    } catch (error) {
        setAdminStatus(error.message, 'error');
    }
}

async function downloadAdminCsv(file) {
    setAdminStatus('正在准备下载...');
    try {
        const response = await fetch(
            `${BASE_PATH}/api/admin/download-csv/${encodePart(file.owner_id)}/${encodePart(file.filename)}`,
            {
                headers: getAdminHeaders(),
            }
        );
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.detail || '下载失败');
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setAdminStatus('下载已开始', 'success');
    } catch (error) {
        setAdminStatus(error.message, 'error');
    }
}

async function deleteAdminCsv(file) {
    if (!confirm(`确定删除 ${file.filename} 吗？`)) return;

    setAdminStatus('正在删除...');
    try {
        const response = await fetch(
            `${BASE_PATH}/api/admin/files/${encodePart(file.owner_id)}/${encodePart(file.filename)}`,
            {
                method: 'DELETE',
                headers: getAdminHeaders(),
            }
        );
        await parseAdminResponse(response);
        setAdminStatus('已删除', 'success');
        await loadAdminFiles();
    } catch (error) {
        setAdminStatus(error.message, 'error');
    }
}
