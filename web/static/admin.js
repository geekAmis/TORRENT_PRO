const API_URL = "/api";

// Вспомогательная функция для запросов (аналог вашего apiFetch)
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

async function loadAdminData() {
    try {
        const [usersRes, levelsRes] = await Promise.all([
            adminFetch("/admin/users"),
            adminFetch("/subscribe/levels")
        ]);

        const users = await usersRes.json();
        const levels = await levelsRes.json();

        renderUsers(users, levels);
        renderLevels(levels);
    } catch (err) {
        console.error("Failed to load admin data:", err);
        alert("Ошибка загрузки данных. Проверьте права доступа.");
    }
}

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
                <button class="btn btn-sm" onclick="openSubModal(${user.id}, '${user.email}', ${JSON.stringify(levels).replace(/"/g, '&quot;')})">Set Sub</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderLevels(levels) {
    const tbody = document.getElementById("levels-table-body");
    tbody.innerHTML = "";
    levels.forEach(lvl => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${lvl.name}</td>
            <td>${lvl.mb_limit}</td>
            <td>${lvl.torrent_limit}</td>
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
        await adminFetch("/admin/set/levels", {
            method: "POST",
            body: params
        });

        location.reload();
    } catch (err) {
        alert(err.message);
    }
}

// Модальное окно управления подпиской
function openSubModal(userId, email, levels) {
    currentTargetUserId = userId;
    document.getElementById("modal-user-email").textContent = email;
    const container = document.getElementById("levels-select-container");
    container.innerHTML = "";

    levels.forEach(lvl => {
        const btn = document.createElement("button");
        btn.className = "btn btn-sm btn-magenta";
        btn.style.marginRight = "5px";
        btn.textContent = lvl.name;
        btn.onclick = () => applySubscription(lvl.id);
        container.appendChild(btn);
    });

    document.getElementById("sub-modal").style.display = "block";
}

async function applySubscription(levelId) {
    try {
        await adminFetch(`/admin/users/${currentTargetUserId}/subscription?level_id=${levelId}`, {
            method: "PATCH"
        });

        closeModal();
        location.reload();
    } catch (err) {
        alert(err.message);
    }
}

function closeModal() {
    document.getElementById("sub-modal").style.display = "none";
}

// Инициализация
document.addEventListener("DOMContentLoaded", loadAdminData);