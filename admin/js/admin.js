/**
 * 后台管理 - 执行机构管理
 * 列表 / 新增弹窗 / 图片上传 / 表单提交
 */
(function () {
    'use strict';

    // ========== DOM ==========
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

    const btnAdd = $('#btnAdd');
    const modalMask = $('#modalMask');
    const modalClose = $('#modalClose');
    const btnSubmit = $('#btnSubmit');
    const orgForm = $('#orgForm');

    // ========== 弹窗控制 ==========
    function openModal() {
        modalMask.classList.add('show');
        document.body.style.overflow = 'hidden';
        // 重置表单
        orgForm.reset();
        // 清空所有预览
        $$('.uploader-preview').forEach(p => {
            p.hidden = true;
            const img = p.querySelector('img');
            if (img) img.src = '';
        });
        $$('.uploader-empty').forEach(e => (e.style.display = 'flex'));
    }

    function closeModal() {
        modalMask.classList.remove('show');
        document.body.style.overflow = '';
    }

    btnAdd.addEventListener('click', openModal);
    modalClose.addEventListener('click', closeModal);
    modalMask.addEventListener('click', e => {
        if (e.target === modalMask) closeModal();
    });

    // ESC 关闭弹窗
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && cropMask.classList.contains('show')) {
            closeCropModal();
        } else if (e.key === 'Escape' && modalMask.classList.contains('show')) {
            closeModal();
        }
    });

    // ========== 图片上传 ==========
    /**
     * 通用上传器：点击空槽选择图片 -> 预览 -> 可移除重传
     * - wechat（微信二维码）：不限制尺寸/方图，直接预览
     * - license（证件资质）：直接预览（由 CSS 裁切为方图展示）
     * - logo：选图后走 1:1 裁剪弹窗（见 setupLogoUploader）
     */
    function setupUploader(target) {
        const empty = $(`.uploader-empty[data-target="${target}"]`);
        const input = $(`.uploader input[type="file"][data-target="${target}"]`);
        const preview = $(`.uploader-preview[data-target="${target}"]`);
        const img = preview.querySelector('img');
        const removeBtn = preview.querySelector('.uploader-remove');

        if (!empty || !input || !preview) return;

        // 点击空槽触发文件选择
        empty.addEventListener('click', () => input.click());

        // 文件变更（wechat / license 通用）
        input.addEventListener('change', e => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) {
                alert('请选择图片文件');
                input.value = '';
                return;
            }
            const reader = new FileReader();
            reader.onload = ev => {
                img.src = ev.target.result;
                preview.hidden = false;
                empty.style.display = 'none';
            };
            reader.readAsDataURL(file);
        });

        // 移除
        removeBtn.addEventListener('click', e => {
            e.stopPropagation();
            input.value = '';
            img.src = '';
            preview.hidden = true;
            empty.style.display = 'flex';
        });

        // 预览点击可重新选择
        preview.addEventListener('click', () => input.click());
    }

    // wechat、license 走通用上传（wechat 无方图/尺寸限制）
    ['wechat', 'license'].forEach(setupUploader);

    // ========== 图片裁剪（固定 1:1，用于 logo） ==========
    const cropMask = $('#cropMask');
    const cropCanvasWrap = $('#cropCanvasWrap');
    const cropCanvas = $('#cropCanvas');
    const cropBtnConfirm = $('#cropBtnConfirm');
    const cropBtnCancel = $('#cropBtnCancel');

    // 裁剪状态
    let cropImg = null;            // 原始图片 Image
    let cropScale = 1;             // 图片显示缩放
    let cropBox = { x: 0, y: 0, size: 0 }; // 裁剪框在画布内的左上角/边长
    let cropLoading = false;

    // 画布固定尺寸（内部逻辑分辨率）
    const CV_W = 320;
    const CV_H = 320;

    function loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = url;
        });
    }

    async function openCropModal(url) {
        try {
            cropImg = await loadImage(url);
        } catch (err) {
            alert(err.message);
            return;
        }
        // 初始化：图片适配画布，裁剪框居中取最大 1:1 区域
        initCropState();
        drawCrop();
        cropMask.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    function closeCropModal() {
        cropMask.classList.remove('show');
        document.body.style.overflow = '';
        cropImg = null;
    }

    // 初始化裁剪状态：图片缩放使至少一边填满画布，裁剪框居中为最大内接正方形
    function initCropState() {
        const iw = cropImg.naturalWidth;
        const ih = cropImg.naturalHeight;
        cropScale = Math.max(CV_W / iw, CV_H / ih);
        // 图片绘制后的宽高
        const dw = iw * cropScale;
        const dh = ih * cropScale;
        // 图片居中绘制于画布
        const imgX = (CV_W - dw) / 2;
        const imgY = (CV_H - dh) / 2;
        // 最大内接正方形边长
        const size = Math.min(dw, dh);
        cropBox = {
            x: imgX + (dw - size) / 2,
            y: imgY + (dh - size) / 2,
            size: size
        };
    }

    function drawCrop() {
        if (!cropImg) return;
        const ctx = cropCanvas.getContext('2d');
        const iw = cropImg.naturalWidth;
        const ih = cropImg.naturalHeight;
        const dw = iw * cropScale;
        const dh = ih * cropScale;
        const imgX = (CV_W - dw) / 2;
        const imgY = (CV_H - dh) / 2;

        // 清空画布
        ctx.clearRect(0, 0, CV_W, CV_H);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, CV_W, CV_H);

        // 绘制图片
        ctx.save();
        ctx.beginPath();
        ctx.rect(cropBox.x, cropBox.y, cropBox.size, cropBox.size);
        ctx.clip();
        ctx.drawImage(cropImg, imgX, imgY, dw, dh);
        ctx.restore();

        // 裁剪框外变暗
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, CV_W, CV_H);
        ctx.clearRect(cropBox.x, cropBox.y, cropBox.size, cropBox.size);

        // 裁剪框边框
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(cropBox.x, cropBox.y, cropBox.size, cropBox.size);

        // 四角把手
        const s = cropBox.size;
        const corners = [
            [cropBox.x, cropBox.y],
            [cropBox.x + s, cropBox.y],
            [cropBox.x, cropBox.y + s],
            [cropBox.x + s, cropBox.y + s]
        ];
        corners.forEach(([cx, cy]) => {
            ctx.fillStyle = '#fff';
            ctx.fillRect(cx - 3, cy - 3, 6, 6);
        });
    }

    // 缩放裁剪框（通过滚轮/按钮），保持 1:1 居中
    function zoomCrop(factor) {
        const newSize = cropBox.size * factor;
        const maxSize = Math.min(CV_W, CV_H);
        const minSize = 40;
        if (newSize < minSize || newSize > maxSize) return;
        // 中心点不动，仅调整边长
        const cx = cropBox.x + cropBox.size / 2;
        const cy = cropBox.y + cropBox.size / 2;
        cropBox.size = newSize;
        cropBox.x = cx - newSize / 2;
        cropBox.y = cy - newSize / 2;
        clampCropBox();
        drawCrop();
    }

    // 限制裁剪框在画布内
    function clampCropBox() {
        const s = cropBox.size;
        cropBox.x = Math.max(0, Math.min(CV_W - s, cropBox.x));
        cropBox.y = Math.max(0, Math.min(CV_H - s, cropBox.y));
    }

    // 裁剪框拖拽
    (function setupCropDrag() {
        let dragging = false;
        let startX = 0, startY = 0;
        let startBox = null;

        cropCanvas.addEventListener('mousedown', e => {
            e.preventDefault();
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startBox = { ...cropBox };
            cropCanvas.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            cropBox.x = startBox.x + dx;
            cropBox.y = startBox.y + dy;
            clampCropBox();
            drawCrop();
        });

        document.addEventListener('mouseup', () => {
            dragging = false;
            cropCanvas.style.cursor = 'grab';
        });

        // 滚轮缩放
        cropCanvas.addEventListener('wheel', e => {
            e.preventDefault();
            zoomCrop(e.deltaY < 0 ? 1.08 : 0.92);
        }, { passive: false });

        // 触摸拖拽
        cropCanvas.addEventListener('touchstart', e => {
            e.preventDefault();
            const t = e.touches[0];
            dragging = true;
            startX = t.clientX;
            startY = t.clientY;
            startBox = { ...cropBox };
        }, { passive: false });

        document.addEventListener('touchmove', e => {
            if (!dragging) return;
            const t = e.touches[0];
            const dx = t.clientX - startX;
            const dy = t.clientY - startY;
            cropBox.x = startBox.x + dx;
            cropBox.y = startBox.y + dy;
            clampCropBox();
            drawCrop();
        }, { passive: false });

        document.addEventListener('touchend', () => {
            dragging = false;
        });
    })();

    // 确认裁剪：从原图按裁剪框比例截取并输出 dataURL
    cropBtnConfirm.addEventListener('click', () => {
        if (!cropImg) return;
        const iw = cropImg.naturalWidth;
        const ih = cropImg.naturalHeight;
        const dw = iw * cropScale;
        const dh = ih * cropScale;
        const imgX = (CV_W - dw) / 2;
        const imgY = (CV_H - dh) / 2;
        // 裁剪框对应的原图像素坐标
        const sx = (cropBox.x - imgX) / cropScale;
        const sy = (cropBox.y - imgY) / cropScale;
        const sSize = cropBox.size / cropScale;

        const out = document.createElement('canvas');
        out.width = Math.round(sSize);
        out.height = Math.round(sSize);
        const octx = out.getContext('2d');
        octx.drawImage(cropImg, sx, sy, sSize, sSize, 0, 0, out.width, out.height);
        const dataUrl = out.toDataURL('image/png');

        // 写入 logo 预览
        const preview = $(`.uploader-preview[data-target="logo"]`);
        const empty = $(`.uploader-empty[data-target="logo"]`);
        const img = preview.querySelector('img');
        img.src = dataUrl;
        preview.hidden = false;
        empty.style.display = 'none';

        closeCropModal();
    });

    cropBtnCancel.addEventListener('click', () => {
        closeCropModal();
    });
    $('#cropBtnClose').addEventListener('click', () => {
        closeCropModal();
    });
    cropMask.addEventListener('click', e => {
        if (e.target === cropMask) closeCropModal();
    });

    // logo 专用上传：选图后打开裁剪弹窗
    (function setupLogoUploader() {
        const empty = $(`.uploader-empty[data-target="logo"]`);
        const input = $(`.uploader input[type="file"][data-target="logo"]`);
        const preview = $(`.uploader-preview[data-target="logo"]`);
        const removeBtn = preview.querySelector('.uploader-remove');

        empty.addEventListener('click', () => input.click());

        input.addEventListener('change', e => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) {
                alert('请选择图片文件');
                input.value = '';
                return;
            }
            const reader = new FileReader();
            reader.onload = ev => {
                openCropModal(ev.target.result);
            };
            reader.readAsDataURL(file);
            input.value = ''; // 允许再次选择同一文件
        });

        removeBtn.addEventListener('click', e => {
            e.stopPropagation();
            input.value = '';
            const img = preview.querySelector('img');
            img.src = '';
            preview.hidden = true;
            empty.style.display = 'flex';
        });

        // 预览点击可重新上传（重新走裁剪）
        preview.addEventListener('click', () => input.click());
    })();

    // ========== 提交 ==========
    btnSubmit.addEventListener('click', () => {
        const formData = new FormData(orgForm);
        const name = (formData.get('name') || '').trim();
        const phone = (formData.get('phone') || '').trim();

        // 校验：必填项
        if (!name) {
            alert('请输入机构名称');
            return;
        }
        if (!phone) {
            alert('请输入联系电话号码');
            return;
        }
        // 联系电话号码不限制格式

        // 校验图片是否已上传
        const needUpload = ['logo', 'license', 'wechat'];
        for (const t of needUpload) {
            const preview = $(`.uploader-preview[data-target="${t}"]`);
            if (!preview || preview.hidden || !preview.querySelector('img').src) {
                const labelMap = { logo: '机构logo', license: '上传证件或资质', wechat: '联系微信二维码' };
                alert(`请上传${labelMap[t]}`);
                return;
            }
        }

        // 模拟提交成功
        alert('提交成功！');
        closeModal();
    });

    // ========== 表格行操作（示例） ==========
    $('#tableBody').addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const tr = btn.closest('tr');
        const name = tr ? tr.children[1].textContent.trim() : '';
        if (btn.classList.contains('btn-view')) {
            alert(`查看：${name}`);
        } else if (btn.classList.contains('btn-edit')) {
            openModal();
        } else if (btn.classList.contains('btn-delete')) {
            if (confirm(`确定要删除「${name}」吗？`)) {
                tr && tr.remove();
            }
        }
    });
})();

// ========== 功能说明浮窗：开关 + 拖拽 ==========
function toggleFuncModal() {
  var el = document.getElementById('funcModal');
  el.classList.toggle('show');
  if (el.classList.contains('show') && !el.dataset.dragged) {
    el.style.left = '50%'; el.style.top = '50%'; el.style.transform = 'translate(-50%,-50%)';
  }
}
(function() {
  var modal, titleBar, offX, offY, dragging = false;
  document.addEventListener('DOMContentLoaded', function() {
    modal = document.getElementById('funcModal');
    titleBar = modal.querySelector('.fm-title');
    titleBar.addEventListener('mousedown', startDrag);
    titleBar.addEventListener('touchstart', startDragTouch, {passive:true});
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchmove', onDragTouch, {passive:true});
    document.addEventListener('touchend', endDrag);
  });
  function startDrag(e) { modal.dataset.dragged = '1'; modal.style.transform = ''; var rect = modal.getBoundingClientRect(); offX = e.clientX - rect.left; offY = e.clientY - rect.top; dragging = true; titleBar.style.cursor = 'grabbing'; }
  function startDragTouch(e) { var t = e.touches[0]; modal.dataset.dragged = '1'; modal.style.transform = ''; var rect = modal.getBoundingClientRect(); offX = t.clientX - rect.left; offY = t.clientY - rect.top; dragging = true; }
  function onDrag(e) { if (!dragging) return; modal.style.left = (e.clientX - offX) + 'px'; modal.style.top = (e.clientY - offY) + 'px'; }
  function onDragTouch(e) { if (!dragging) return; var t = e.touches[0]; modal.style.left = (t.clientX - offX) + 'px'; modal.style.top = (t.clientY - offY) + 'px'; }
  function endDrag() { dragging = false; if (titleBar) titleBar.style.cursor = 'grab'; }
})();
