// ========================================================================
// TRANSFORMER DLA GRUPY ELEMENTÓW – DZIAŁA Z KONVA 9+
// ========================================================================
function enableGroupTransform(nodes, page) {
    const layer = page.layer;

    // USUWAMY STARE TRANSFORMERY – NOWA SKŁADNIA KONVA 9
    layer.find('Transformer').forEach(t => t.destroy());

    // Tworzymy nowy transformer dla grupy
    const tr = new Konva.Transformer({
        nodes: nodes,
        padding: 10,
        rotateEnabled: true,
        keepRatio: false,
        centeredRotation: true,
        borderStroke: '#3399ff',
        borderStrokeWidth: 2,
        anchorStroke: '#3399ff',
        anchorFill: '#fff',
        anchorSize: 10
    });

    layer.add(tr);
    tr.forceUpdate();
    layer.batchDraw();

    // Synchronizacja przesuwania grupy
    let isDragging = false;

    nodes.forEach(node => {
        node.draggable(true);

        node.on('dragstart', () => {
            isDragging = true;
        });

        node.on('dragmove', () => {
            if (!isDragging) return;

            const dx = node.x() - (node._lastDragPos?.x || node.x());
            const dy = node.y() - (node._lastDragPos?.y || node.y());

            nodes.forEach(n => {
                if (n !== node) {
                    n.x(n.x() + dx);
                    n.y(n.y() + dy);
                }
            });

            node._lastDragPos = { x: node.x(), y: node.y() };
        });

        node.on('dragend', () => {
            isDragging = false;
            nodes.forEach(n => delete n._lastDragPos);
        });
    });
}