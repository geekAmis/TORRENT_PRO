const API_URL = "/api";

async function adminFetch(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
        credentials: "include",
        ...options,
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `Error ${response.status}`);
    }
    return response;
}

let currentTargetUserId = null;
let currentEditLvlId = null;

async function loadAdminData() {
    try {
        // Загружаем всё параллельно
        const [usersRes, levelsRes, diskRes, logsRes] = await Promise.all([
            adminFetch("/admin/users"),
            adminFetch("/subscribe/levels"),
            adminFetch("/admin/system/disk"),
            adminFetch("/admin/system/logs?limit=50")
        ]);

        const users = await usersRes.json();
        const levels = await levelsRes.json();
        const disk = await diskRes.json();
        const logs = await logsRes.json();

        renderUsers(users, levels);
        renderLevels(levels);
        renderDisk(disk);
        renderLogs(logs.logs);

    } catch (err) {
        console.error("Failed to load admin data:", err);
        alert("Ошибка загрузки данных. Проверьте права доступа.");
    }
}

// --- SYSTEM RENDERING ---

function renderDisk(disk) {
    const container = document.getElementById("disk-info");
    container.innerHTML = `
        <div style="font-size: 0.8rem;">
            <div style="color: var(--neon-cyan)">Path: ${disk.path}</div>
            <div>Free: <span style="color: #00ff00">${disk.free_gb} GB</span></div>
            <div>Used: <span style="color: var(--neon-magenta)">${disk.used_gb} GB</span></div>
            <div>Total: ${disk.total_gb} GB</div>
            <div style="width: 100%; background: #222; height: 8px; margin-top: 5px; border-radius: 4px;">
                <div style="width: ${disk.percent_used}%; background: var(--neon-cyan); height: 100%; border-radius: 4px;"></div>
            </div>
            <div style="font-size: 0.6rem; text-align: right; margin-top: 2px;">${disk.percent_used}% used</div>
        </div>
    `;
}

function renderLogs(logs) {
    const container = document.getElementById("logs-container");
    container.innerHTML = "";
    logs.forEach(log => {
        const div = document.createElement("div");
        div.style.marginBottom = "5px";
        div.style.borderBottom = "1px solid #111";
        
        let color = "var(--text)";
        if (log.level === "ERROR") color = "var(--neon-magenta)";
        if (log.level === "WARNING") color = "orange";

        div.innerHTML = `
            <span style="color: #666;">[${log.timestamp.split(' ')[1].split(',')[0]}]</span>
            <span style="color: ${color}; font-weight: bold;">${log.level}</span>: 
            <span>${log.message}</span>
        `;
        container.appendChild(div);
    });
    container.scrollTop = 0; // Скроллим к последним (т.к. мы сортируем reverse)
}

async function loadLogs() {
    const level = document.getElementById("log-level-filter").value;
    try {
        const res = await adminFetch(`/admin/system/logs?level=${level}&limit=50`);
        const data = await res.json();
        renderLogs(data.logs);
    } catch (err) {
        console.error(err);
    }
}

// --- USER RENDERING ---

function renderUsers(users, levels) {
    const tbody = document.getElementById("users-table-body");
    tbody.innerHTML = "";

    users.forEach(user => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${user.email}</td>
            <td><span class="badge">${user.subscription_name}</span></td>
            <td>${user.downloads_count}</td>
            <td>${user.total_mb} MB</td>
            <td>
                <div style="display:flex; gap: 5px;">
                    <button class="btn btn-sm" onclick="openSubModal(${user.id}, '${user.email}', ${JSON.stringify(levels).replace(/"/g, '&quot;')})">Set Sub</button>
                    <button class="btn btn-sm btn-magenta" onclick="deleteUser(${user.id})">Del</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function deleteUser(userId) {
    if (!confirm("Удалить пользователя навсегда?")) return;
    try {
        await adminFetch(`/admin/users/${userId}`, { method: "DELETE" });
        loadAdminData();
    } catch (err) {
        alert(err.message);
    }
}

// --- LEVEL RENDERING ---

function renderLevels(levels) {
    const tbody = document.getElementById("levels-table-body");
    tbody.innerHTML = "";
    levels.forEach(lvl => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${lvl.name}</td>
            <td>${lvl.mb_limit} MB</td>
            <td>${lvl.torrent_limit}</td>
            <td>
                <div style="display:flex; gap: 5px;">
                    <button class="btn btn-sm" onclick="openEditLvlModal(${JSON.stringify(lvl).replace(/"/g, '&quot;')})">Edit</button>
                    <button class="btn btn-sm btn-magenta" onclick="deleteLevel(${lvl.id})">Del</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function createLevel() {
    const name = document.getElementById("lvl-name").value;
    const mb = parseFloat(document.getElementById("lvl-mb").value);
    const torrent = parseInt(document.getElementById("lvl-torrent").value);

    if (!name || isNaN(mb) || isNaN(torrent)) {
        alert("Заполните все поля корректно");
        return;
    }

    const params = new URLSearchParams();
    params.append("name", name);
    params.append("mb_limit", mb);
    params.append("torrent_limit", torrent);

    try {
        await adminFetch("/admin/set/levels", { method: "POST", body: params });
        loadAdminData();
    } catch (err) {
        alert(err.message);
    }
}

async function deleteLevel(levelId) {
    if (!confirm("Удалить тариф? (Нельзя, если на нем есть пользователи)")) return;
    try {
        await adminFetch(`/admin/levels/${levelId}`, { method: "DELETE" });
        loadAdminData();
    } catch (err) {
        alert(err.message);
    }
}

// Редактирование
function openEditLvlModal(lvl) {
    currentEditLvlId = lvl.id;
    document.getElementById("edit-lvl-id").value = lvl.id;
    document.getElementById("edit-lvl-name").value = lvl.name;
    document.getElementById("edit-lvl-mb").value = lvl.mb_limit;
    document.getElementById("edit-lvl-torrent").value = lvl.torrent_limit;
    document.getElementById("edit-lvl-modal").style.display = "block";
}

async function saveLevelEdit() {
    const name = document.getElementById("edit-lvl-name").value;
    const mb = parseFloat(document.getElementById("edit-lvl-mb").value);
    const torrent = parseInt(document.getElementById("edit-lvl-torrent").value);

    const params = new URLSearchParams();
    params.append("name", name);
    params.append("mb_limit", mb);
    params.append("torrent_limit", torrent);

    try {
        await adminFetch(`/admin/levels/${currentEditLvlId}`, {
            method: "PUT",
            body: params
        });
        document.getElementById("edit-lvl-modal").style.display = "none";
        loadAdminData();
    } catch (err) {
        alert(err.message);
    }
}

// --- MODALS ---

function openSubModal(userId, email, levels) {
    currentTargetUserId = userId;
    document.getElementById("modal-user-email").textContent = email;
    const container = document.getElementById("levels-select-container");
    container.innerHTML = "";

    levels.forEach(lvl => {
        const btn = document.createElement("button");
        btn.className = "btn btn-full btn-magenta";
        btn.textContent = `Set to ${lvl.name}`;
        btn.onclick = () => applySubscription(lvl.id);
        container.appendChild(btn);
    });

    document.getElementById("sub-modal").style.display = "block";
}

async function applySubscription(levelId) {
    try {
        // Внимание: в твоем Python коде это PATCH /admin/users/{user_id}/subscription
        // Но в запросе ты пытался отправить query param. Исправляем на правильный путь.
        await adminFetch(`/admin/users/${currentTargetUserId}/subscription?level_id=${levelId}`, {
            method: "PATCH"
        });
        closeModal();
        loadAdminData();
    } catch (err) {
        alert(err.message);
    }
}

function closeModal() {
    document.getElementById("sub-modal").style.display = "none";
    document.getElementById("edit-lvl-modal").style.display = "none";
}

function refreshAll() {
    loadAdminData();
}

document.addEventListener("DOMContentLoaded", loadAdminData);