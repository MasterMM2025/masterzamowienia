(function () {
  const STYLE_DEFAULT = "default";
  const STYLE_ELEGANT = "styl_elegancki";
  const STYLE_CUSTOM = "styl_wlasny";

  function getPriceTextNodes(group) {
    if (!group || !group.getChildren) return [];
    return group.getChildren().filter((n) => n instanceof Konva.Text);
  }

  function saveNodeOriginal(node) {
    if (!node || node.getAttr("elegantLayoutSaved")) return;
    node.setAttr("elegantLayoutSaved", true);
    node.setAttr("elegantOrigX", node.x());
    node.setAttr("elegantOrigY", node.y());
    if (typeof node.scaleX === "function") node.setAttr("elegantOrigScaleX", node.scaleX());
    if (typeof node.scaleY === "function") node.setAttr("elegantOrigScaleY", node.scaleY());
    if (typeof node.width === "function") node.setAttr("elegantOrigWidthNode", node.width());
    if (typeof node.height === "function") node.setAttr("elegantOrigHeightNode", node.height());
    if (typeof node.align === "function") node.setAttr("elegantOrigAlignNode", node.align());
    if (typeof node.wrap === "function") node.setAttr("elegantOrigWrapNode", node.wrap());
    if (typeof node.fontSize === "function") node.setAttr("elegantOrigFontSizeNode", node.fontSize());
    if (typeof node.lineHeight === "function") node.setAttr("elegantOrigLineHeightNode", node.lineHeight());
  }

  function restoreNodeOriginal(node) {
    if (!node || !node.getAttr("elegantLayoutSaved")) return;
    const ox = node.getAttr("elegantOrigX");
    const oy = node.getAttr("elegantOrigY");
    const osx = node.getAttr("elegantOrigScaleX");
    const osy = node.getAttr("elegantOrigScaleY");
    const ow = node.getAttr("elegantOrigWidthNode");
    const oh = node.getAttr("elegantOrigHeightNode");
    const oa = node.getAttr("elegantOrigAlignNode");
    const owrap = node.getAttr("elegantOrigWrapNode");
    const ofs = node.getAttr("elegantOrigFontSizeNode");
    const olh = node.getAttr("elegantOrigLineHeightNode");

    if (typeof ox === "number") node.x(ox);
    if (typeof oy === "number") node.y(oy);
    if (typeof osx === "number" && typeof node.scaleX === "function") node.scaleX(osx);
    if (typeof osy === "number" && typeof node.scaleY === "function") node.scaleY(osy);
    if (typeof ow === "number" && typeof node.width === "function") node.width(ow);
    if (typeof oh === "number" && typeof node.height === "function") node.height(oh);
    if (typeof oa === "string" && typeof node.align === "function") node.align(oa);
    if (typeof owrap === "string" && typeof node.wrap === "function") node.wrap(owrap);
    if (typeof ofs === "number" && typeof node.fontSize === "function") node.fontSize(ofs);
    if (typeof olh === "number" && typeof node.lineHeight === "function") node.lineHeight(olh);
  }

  function fitImageIntoRect(img, x, y, width, height) {
    if (!img || !img.width || !img.height) return;
    const sx = Number.isFinite(img.scaleX()) ? img.scaleX() : 1;
    const sy = Number.isFinite(img.scaleY()) ? img.scaleY() : 1;
    const naturalW = Math.max(1, img.width() * sx);
    const naturalH = Math.max(1, img.height() * sy);
    const scale = Math.min(width / naturalW, height / naturalH);
    const targetScaleX = sx * scale;
    const targetScaleY = sy * scale;
    const finalW = Math.max(1, img.width() * targetScaleX);
    const finalH = Math.max(1, img.height() * targetScaleY);
    img.scaleX(targetScaleX);
    img.scaleY(targetScaleY);
    img.x(x + (width - finalW) / 2);
    img.y(y + (height - finalH) / 2);
  }

  function applyElegantSlotLayout(page, styleName) {
    if (!page || !page.layer) return;
    const isElegant = styleName === STYLE_ELEGANT;
    const boxes = page.layer.find((n) => n.getAttr && n.getAttr("isBox"));
    const nodesInSlot = (slotIndex, matcher) =>
      page.layer.find((n) => n.getAttr && n.getAttr("slotIndex") === slotIndex && matcher(n));

    boxes.forEach((box) => {
      const slotIndex = box.getAttr("slotIndex");
      if (!Number.isFinite(slotIndex)) return;

      const boxRect = box.getClientRect({ relativeTo: page.layer });
      const x = boxRect.x;
      const y = boxRect.y;
      const w = boxRect.width;
      const h = boxRect.height;
      const pageCenterX = page?.stage?.width ? page.stage.width() / 2 : x + w;
      const boxCenterX = x + w / 2;
      const sideDir = boxCenterX < pageCenterX ? -1 : 1;
      const shiftRatio = sideDir > 0 ? 0.10 : 0.08;
      const slotShiftX = sideDir * w * shiftRatio;
      const slotX = x + slotShiftX;

      const nameNodes = nodesInSlot(slotIndex, (n) => n instanceof Konva.Text && n.getAttr("isName"));
      const indexNodes = nodesInSlot(slotIndex, (n) => n instanceof Konva.Text && n.getAttr("isIndex"));
      const imageNodes = nodesInSlot(slotIndex, (n) => n instanceof Konva.Image && n.getAttr("isProductImage"));
      const barcodeNodes = nodesInSlot(slotIndex, (n) => n instanceof Konva.Image && n.getAttr("isBarcode"));
      const countryNodes = nodesInSlot(slotIndex, (n) => n instanceof Konva.Image && n.getAttr("isCountryBadge"));
      const priceGroups = nodesInSlot(slotIndex, (n) => n instanceof Konva.Group && n.getAttr("isPriceGroup"));

      const image = imageNodes[0];
      const name = nameNodes[0];
      const index = indexNodes[0];
      const barcode = barcodeNodes[0];
      const country = countryNodes[0];
      const priceGroup = priceGroups[0];

      [image, name, index, barcode, country, priceGroup].forEach((n) => n && saveNodeOriginal(n));

      if (!isElegant) {
        [image, name, index, barcode, country, priceGroup].forEach((n) => n && restoreNodeOriginal(n));
        if (priceGroup) priceGroup.setAttr("elegantForcedY", null);
        return;
      }

      // Uklad 1:1 jak w podgladzie stylu wlasnego (procenty wzgledem modulu).
      const imageRect = {
        x: slotX + w * 0.00,
        y: y + h * 0.04,
        w: w * 0.48,
        h: h * 0.83
      };
      const nameRect = {
        x: slotX + w * 0.53,
        y: y + h * 0.50,
        w: w * 0.43,
        h: h * 0.12
      };
      const indexRect = {
        x: slotX + w * 0.535,
        y: y + h * 0.62,
        w: w * 0.39
      };
      const flagRect = {
        // Flaga podniesiona JESZCZE lekko do GÓRY (mniejsza wartość Y).
        x: slotX + w * 0.54,
        y: y + h * 0.498,
        w: w * 0.30,
        h: h * 0.03
      };
      const barcodeRect = {
        x: slotX + w * 0.40,
        y: y + h * 0.76,
        w: w * 0.49,
        h: h * 0.22
      };

      if (image) {
        fitImageIntoRect(image, imageRect.x, imageRect.y, imageRect.w, imageRect.h);
        // Użytkownik: kolejne -1/4 względem poprzedniego stanu (1.5x -> 1.125x).
        const cX = image.x() + (image.width() * image.scaleX()) / 2;
        const cY = image.y() + (image.height() * image.scaleY()) / 2;
        image.scaleX(image.scaleX() * 1.125);
        image.scaleY(image.scaleY() * 1.125);
        const nW = image.width() * image.scaleX();
        const nH = image.height() * image.scaleY();
        image.x(cX - nW / 2);
        image.y(cY - nH / 2);
      }

      if (barcode) {
        fitImageIntoRect(barcode, barcodeRect.x, barcodeRect.y, barcodeRect.w, barcodeRect.h);
      }

      if (country) {
        fitImageIntoRect(country, flagRect.x, flagRect.y, flagRect.w, flagRect.h);
      }

      if (index) {
        index.x(indexRect.x);
        index.y(indexRect.y);
        index.width(indexRect.w);
        index.align("left");
        index.wrap("none");
        index.fontSize(Math.max(8, Math.round(h * 0.048)));
      }

      if (name) {
        name.x(nameRect.x);
        name.y(nameRect.y);
        name.width(nameRect.w);
        name.height(nameRect.h);
        name.fontSize(12);
        name.align("left");
        name.wrap("word");
        name.ellipsis(false);
        name.lineHeight(1.02);
      }

      if (priceGroup) {
        const targetX = slotX + w * 0.22;
        const targetY = y + h * 0.58;
        priceGroup.x(targetX);
        priceGroup.y(targetY);
        priceGroup.setAttr("elegantForcedY", targetY);
        priceGroup.moveToTop();
      }

      // Kolejność warstw: zdjęcie pod ceną, cena nad zdjęciem.
      if (image) image.moveToTop();
      if (priceGroup) priceGroup.moveToTop();
    });
  }

  function applyElegantPriceStyle(group) {
    if (!group) return;

    const texts = getPriceTextNodes(group);
    if (!texts.length) return;

    // Umożliwia ponowne przeliczenie układu po edycji ceny.
    if (group.getAttr("isElegantPriceStyled")) {
      restoreDefaultPriceStyle(group);
    }

    texts.forEach((t) => {
      if (t.getAttr("elegantOrigX") == null) t.setAttr("elegantOrigX", t.x());
      if (t.getAttr("elegantOrigY") == null) t.setAttr("elegantOrigY", t.y());
      if (!t.getAttr("elegantOrigFill")) t.setAttr("elegantOrigFill", t.fill() || "#000000");
      if (t.getAttr("elegantOrigFontSize") == null) t.setAttr("elegantOrigFontSize", t.fontSize());
      if (t.getAttr("elegantOrigWidth") == null) t.setAttr("elegantOrigWidth", t.width());
      if (t.getAttr("elegantOrigWrap") == null) t.setAttr("elegantOrigWrap", t.wrap());
      if (t.getAttr("elegantOrigAlign") == null) t.setAttr("elegantOrigAlign", t.align());
      if (t.getAttr("elegantOrigEllipsis") == null) t.setAttr("elegantOrigEllipsis", !!t.ellipsis());
    });

    const boxes = texts.map((t) => t.getClientRect({ relativeTo: group }));
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.width));
    const maxY = Math.max(...boxes.map((b) => b.y + b.height));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);

    const isLayout8 = String(window.LAYOUT_MODE || "").toLowerCase() === "layout8";
    // Delikatnie mniejsze kola, ale z limitem min/max zeby tekst ceny zawsze byl czytelny.
    const layout8CircleScale = 0.72;
    const layout6PriceScale = 0.60;
    const baseDiameter = Math.max(width, height) + (isLayout8 ? 24 : 22);
    let diameter = isLayout8
      ? Math.round(baseDiameter * layout8CircleScale)
      : Math.round(baseDiameter * layout6PriceScale);
    diameter = isLayout8
      ? Math.max(62, Math.min(88, diameter))
      : Math.max(74, Math.min(102, diameter));
    const radius = diameter / 2;
    const centerX = radius;
    const centerY = radius;

    const forcedY = group.getAttr("elegantForcedY");
    if (typeof forcedY === "number") {
      group.y(forcedY);
    } else {
      // Delikatnie wyżej dla obu layoutów.
      if (group.getAttr("elegantOrigGroupY") == null) {
        group.setAttr("elegantOrigGroupY", group.y());
      }
      const upOffset = isLayout8 ? 8 : 6;
      const origY = group.getAttr("elegantOrigGroupY");
      if (typeof origY === "number") group.y(origY - upOffset);
    }

    // Stabilny uklad tekstu ceny wewnatrz kola.
    // Klucz: pozycjonowanie tylko z metryk tekstu, bez dodatkowego "dopychania" rectami.
    group.scale({ x: 1, y: 1 });
    const sortedBySize = [...texts].sort((a, b) => b.fontSize() - a.fontSize());
    const main = sortedBySize[0];
    const decimal = texts.find((t) => t !== main && /^\d+$/.test((t.text() || "").trim())) || sortedBySize[1];
    const unit = texts.find((t) => t !== main && t !== decimal && /\/|€|£|zł|zl/i.test(t.text() || "")) || sortedBySize[2];

    if (main && decimal && unit) {
      const unitText = (unit.text() || "").replace(/\/\s*SZT?\b\.?/gi, "/ SZT.");
      if (unitText) unit.text(unitText);

      [main, decimal, unit].forEach((t) => {
        t.scale({ x: 1, y: 1 });
        t.wrap("none");
        t.ellipsis(false);
        t.align("left");
        t.width(undefined);
      });

      const mainLen = Math.max(1, (main.text() || "").trim().length);
      const minMain = isLayout8 ? 13 : 16;
      const minDec = isLayout8 ? 10 : 11;
      const minUnit = isLayout8 ? 8 : 9;

      let fsMain = Math.round(
        diameter * (isLayout8 ? (mainLen >= 2 ? 0.44 : 0.56) : (mainLen >= 2 ? 0.47 : 0.62))
      );
      let fsDec = Math.round(fsMain * 0.44);
      let fsUnit = Math.round(fsMain * 0.28);

      const safePad = isLayout8 ? 5 : 6;
      const leftLimit = centerX - radius + safePad;
      const rightLimit = centerX + radius - safePad;
      const topLimit = centerY - radius + safePad;
      const bottomLimit = centerY + radius - safePad;

      const rectUnion = () => {
        const nodes = [main, decimal, unit];
        const rects = nodes.map((n) => n.getClientRect({ relativeTo: group }));
        const x1 = Math.min(...rects.map((r) => r.x));
        const y1 = Math.min(...rects.map((r) => r.y));
        const x2 = Math.max(...rects.map((r) => r.x + r.width));
        const y2 = Math.max(...rects.map((r) => r.y + r.height));
        return { x: x1, y: y1, width: Math.max(1, x2 - x1), height: Math.max(1, y2 - y1) };
      };

      const layoutText = () => {
        main.fontSize(Math.max(minMain, fsMain));
        decimal.fontSize(Math.max(minDec, fsDec));
        unit.fontSize(Math.max(minUnit, fsUnit));

        [main, decimal, unit].forEach((t) => {
          t.x(0);
          t.y(0);
        });

        const mMain = main.getClientRect({ relativeTo: group });
        const mDec = decimal.getClientRect({ relativeTo: group });
        const mUnit = unit.getClientRect({ relativeTo: group });

        const colGap = Math.max(2, Math.round(diameter * 0.03));
        const lineGap = Math.max(1, Math.round(diameter * 0.01));

        const rightColW = Math.max(mDec.width, mUnit.width);
        const blockW = mMain.width + colGap + rightColW;
        const blockH = Math.max(mMain.height, mDec.height + lineGap + mUnit.height);

        // lekko nizej, zeby optycznie bylo centralnie
        const startX = centerX - blockW / 2;
        const startY = centerY - blockH / 2 + 1;

        main.x(startX);
        main.y(startY + (blockH - mMain.height) / 2);
        decimal.x(startX + mMain.width + colGap);
        decimal.y(startY);
        unit.x(startX + mMain.width + colGap);
        unit.y(startY + mDec.height + lineGap);
      };

      let fitted = false;
      for (let i = 0; i < 48; i++) {
        layoutText();
        const r = rectUnion();
        const fits =
          r.x >= leftLimit &&
          r.y >= topLimit &&
          r.x + r.width <= rightLimit &&
          r.y + r.height <= bottomLimit;

        if (fits) {
          fitted = true;
          break;
        }

        if (fsMain <= minMain && fsDec <= minDec && fsUnit <= minUnit) break;
        fsMain = Math.max(minMain, fsMain - 1);
        fsDec = Math.max(minDec, fsDec - 1);
        fsUnit = Math.max(minUnit, fsUnit - 1);
      }

      if (!fitted) {
        layoutText();
        const r = rectUnion();
        const dx = Math.max(leftLimit - r.x, Math.min(0, rightLimit - (r.x + r.width)));
        const dy = Math.max(topLimit - r.y, Math.min(0, bottomLimit - (r.y + r.height)));
        if (dx || dy) {
          [main, decimal, unit].forEach((t) => {
            t.x(t.x() + dx);
            t.y(t.y() + dy);
          });
        }
      }
    } else {
      const currentCenterX = minX + width / 2;
      const currentCenterY = minY + height / 2;
      const dx = centerX - currentCenterX;
      const dy = (centerY - currentCenterY) - 8;
      texts.forEach((t) => {
        t.x(t.x() + dx);
        t.y(t.y() + dy);
      });
    }

    // Zachowujemy pozycje wyliczone wyzej (layout8), tylko ujednolicamy kolor.
    texts.forEach((t) => t.fill("#ffffff"));

    let bg = group.findOne((n) => n.getAttr && n.getAttr("isElegantPriceBg"));
    if (!bg) {
      bg = new Konva.Circle({
        x: centerX,
        y: centerY,
        radius,
        fill: "#d71920",
        listening: false
      });
      bg.setAttr("isElegantPriceBg", true);
      group.add(bg);
      bg.moveToBottom();
    } else {
      bg.x(centerX);
      bg.y(centerY);
      bg.radius(radius);
      bg.fill("#d71920");
    }

    group.setAttr("isElegantPriceStyled", true);
  }

  function restoreDefaultPriceStyle(group) {
    if (!group) return;
    const texts = getPriceTextNodes(group);
    const bg = group.findOne((n) => n.getAttr && n.getAttr("isElegantPriceBg"));
    if (bg) bg.destroy();

    texts.forEach((t) => {
      const ox = t.getAttr("elegantOrigX");
      const oy = t.getAttr("elegantOrigY");
      const of = t.getAttr("elegantOrigFill");
      const ofs = t.getAttr("elegantOrigFontSize");
      const ow = t.getAttr("elegantOrigWidth");
      const owrap = t.getAttr("elegantOrigWrap");
      const oalign = t.getAttr("elegantOrigAlign");
      const oell = t.getAttr("elegantOrigEllipsis");
      if (typeof ox === "number") t.x(ox);
      if (typeof oy === "number") t.y(oy);
      t.fill(of || "#000000");
      if (typeof ofs === "number") t.fontSize(ofs);
      if (ow != null) t.width(ow);
      if (typeof owrap === "string") t.wrap(owrap);
      if (typeof oalign === "string") t.align(oalign);
      t.ellipsis(!!oell);
    });

    const origGroupY = group.getAttr("elegantOrigGroupY");
    if (typeof origGroupY === "number") {
      group.y(origGroupY);
    }
    group.setAttr("elegantForcedY", null);

    group.setAttr("isElegantPriceStyled", false);
  }

  function stylePricesForPage(page, styleName) {
    if (!page || !page.layer) return;
    const priceGroups = page.layer.find((n) => n instanceof Konva.Group && n.getAttr && n.getAttr("isPriceGroup"));
    priceGroups.forEach((g) => {
      if (styleName === STYLE_ELEGANT) {
        applyElegantPriceStyle(g);
      } else {
        restoreDefaultPriceStyle(g);
      }
    });
  }

  function styleBoxesForPage(page, styleName) {
    if (!page || !page.layer) return;
    const isElegant = styleName === STYLE_ELEGANT;
    const boxes = page.layer.find((n) => n.getAttr && n.getAttr("isBox"));
    boxes.forEach((box) => {
      if (isElegant) {
        if (!box.getAttr("elegantOrigBoxStateSaved")) {
          box.setAttr("elegantOrigVisible", box.visible());
          box.setAttr("elegantOrigListening", box.listening());
          box.setAttr("elegantOrigDraggable", box.draggable());
          box.setAttr("elegantOrigSelectable", box.getAttr("selectable"));
          box.setAttr("elegantOrigBoxStateSaved", true);
        }

        box.fill("rgba(0,0,0,0)");
        box.stroke("rgba(0,0,0,0)");
        box.strokeWidth(0);
        box.cornerRadius(0);
        box.shadowBlur(0);
        box.shadowOpacity(0);
        box.shadowOffset({ x: 0, y: 0 });
        box.visible(false);
        box.listening(false);
        box.draggable(false);
        box.setAttr("selectable", false);
        box.setAttr("isHiddenByCatalogStyle", true);
      } else {
        const origVisible = box.getAttr("elegantOrigVisible");
        const origListening = box.getAttr("elegantOrigListening");
        const origDraggable = box.getAttr("elegantOrigDraggable");
        const origSelectable = box.getAttr("elegantOrigSelectable");

        box.visible(typeof origVisible === "boolean" ? origVisible : true);
        box.listening(typeof origListening === "boolean" ? origListening : true);
        box.draggable(typeof origDraggable === "boolean" ? origDraggable : true);
        box.setAttr("selectable", origSelectable === undefined ? true : origSelectable);
        box.setAttr("isHiddenByCatalogStyle", false);
        box.fill("#ffffff");
        box.stroke("rgba(0,0,0,0.06)");
        box.strokeWidth(1);
        box.cornerRadius(10);
        box.shadowColor("rgba(0,0,0,0.18)");
        box.shadowBlur(30);
        box.shadowOffset({ x: 0, y: 12 });
        box.shadowOpacity(0.8);
      }
    });

    if (isElegant && Array.isArray(page.selectedNodes) && page.selectedNodes.length) {
      const filtered = page.selectedNodes.filter((n) => !(n && n.getAttr && n.getAttr("isBox")));
      if (filtered.length !== page.selectedNodes.length) {
        page.selectedNodes = filtered;
        page.transformer?.nodes?.(filtered);
        page.layer.find(".selectionOutline").forEach((n) => n.destroy());
      }
    }

    applyElegantSlotLayout(page, styleName);
    stylePricesForPage(page, styleName);
    page.layer.batchDraw();
    page.transformerLayer?.batchDraw?.();
  }

  // Główny hook stylu: działa także dla projektów wczytanych z save (bez pełnego rebuilda).
  window.applyCatalogStyleVisual = function (styleName) {
    if (!Array.isArray(window.pages)) return;
    window.pages.forEach((p) => styleBoxesForPage(p, styleName || STYLE_DEFAULT));
  };

  function ensureModal() {
    if (document.getElementById("stylePickerModal")) return;

    const overlay = document.createElement("div");
    overlay.id = "stylePickerModal";
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "background:rgba(12,18,31,.44)",
      "display:none",
      "align-items:center",
      "justify-content:center",
      "z-index:1000000"
    ].join(";");

    overlay.innerHTML = `
      <div style="width:min(720px,92vw);background:#fff;border-radius:18px;padding:22px;box-shadow:0 24px 54px rgba(0,0,0,.2);font-family:Inter,Arial,sans-serif;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px;">
          <h3 style="margin:0;font-size:30px;font-weight:800;line-height:1;color:#0f172a;">Wybierz styl</h3>
          <button id="stylePickerClose" type="button" style="border:none;background:#eef2f7;color:#1f2937;font-size:26px;line-height:1;padding:8px 14px;border-radius:12px;cursor:pointer;">×</button>
        </div>

        <div style="margin-bottom:14px;color:#64748b;font-size:14px;">Test: styl elegancki wyłącza boxy produktów.</div>

        <div id="stylePickerGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;">
          <button type="button" data-style="default" style="text-align:left;border:1px solid #d7dfec;background:#fff;border-radius:12px;padding:14px;cursor:pointer;">
            <div style="font-size:16px;font-weight:700;color:#0f172a;">Domyślny</div>
            <div style="font-size:13px;color:#64748b;margin-top:4px;">Aktualny wygląd katalogu.</div>
          </button>
          <button type="button" data-style="styl_elegancki" style="text-align:left;border:1px solid #d7dfec;background:#fff;border-radius:12px;padding:14px;cursor:pointer;">
            <div style="font-size:16px;font-weight:700;color:#0f172a;">Styl elegancki</div>
            <div style="font-size:13px;color:#64748b;margin-top:4px;">Produkty bez białych boxów (test).</div>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => {
      overlay.style.display = "none";
    };

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    const closeBtn = overlay.querySelector("#stylePickerClose");
    if (closeBtn) closeBtn.addEventListener("click", close);

    overlay.querySelectorAll("[data-style]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const styleName = btn.getAttribute("data-style") || STYLE_DEFAULT;
        if (typeof window.applyCatalogStyle === "function") {
          window.applyCatalogStyle(styleName);
        } else {
          window.CATALOG_STYLE = styleName;
        }
        close();
      });
    });
  }

  function bindTrigger() {
    const trigger = document.getElementById("chooseStyleBtn");
    if (!trigger) return;

    ensureModal();

    trigger.addEventListener("click", () => {
      const modal = document.getElementById("stylePickerModal");
      if (!modal) return;
      modal.style.display = "flex";

      const current = window.CATALOG_STYLE || STYLE_DEFAULT;
      modal.querySelectorAll("[data-style]").forEach((btn) => {
        const on = btn.getAttribute("data-style") === current;
        btn.style.borderColor = on ? "#2563eb" : "#d7dfec";
        btn.style.background = on ? "#eff6ff" : "#fff";
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindTrigger);
  } else {
    bindTrigger();
  }
})();
