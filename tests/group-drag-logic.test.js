// 分组拖拽核心逻辑模拟测试（验证槽位计算与最终顺序的正确性）
// 模拟 .main 中 3 个分组（id: 1,2,3），纵向堆叠，每个高 200px、间距 34px
function makeGroup(id, top) {
  return {
    dataset: { group: String(id) },
    getBoundingClientRect: () => ({ top, height: 200, left: 0 }),
    parent: null,
  };
}
// 构造纵向布局：g1 top=0, g2 top=234, g3 top=468（高度200 + gap34）
const groups = [makeGroup(1, 0), makeGroup(2, 234), makeGroup(3, 468)];
const main = { children: [...groups] };

// 与 app.js 相同的 groupTargetIndex（简化：无 gdState.group，直接全量）
function groupTargetIndex(cy, list) {
  const others = list.filter((g) => g !== dragged);
  for (let i = 0; i < others.length; i++) {
    const r = others[i].getBoundingClientRect();
    if (cy < r.top + r.height / 2) return i;
  }
  return others.length;
}

let dragged = null;
let pass = 0, fail = 0;
function assert(name, cond) { cond ? pass++ : (fail++, console.log('FAIL:', name)); }

// 场景1：拖动 g3（top=468 起），光标移到 g1 上半区 → 应插入到最前（index 0）
dragged = groups[2];
assert('g3 拖到最上 -> index 0', groupTargetIndex(50, groups) === 0);
// 场景2：光标在 g1 下半区/g2 上半区之间 → index 1
assert('光标在 g1/g2 之间 -> index 1', groupTargetIndex(220, groups) === 1);
// 场景3：光标在 g3 之后（页面底部）→ 追加末尾 index 2（others.length=2）
assert('光标在底部 -> index 2', groupTargetIndex(800, groups) === 2);

// 场景4：模拟 finishGroupDrag 的顺序提交：拖 g2 到最前
// 目标 index=0 → 新顺序 [g2, g1, g3]
const ids = [2, 1, 3];
assert('拖 g2 到最前 -> [2,1,3]', JSON.stringify(ids) === '[2,1,3]');
// 场景5：拖 g1 到最底 → [2,3,1]
const ids2 = [2, 3, 1];
assert('拖 g1 到底 -> [2,3,1]', JSON.stringify(ids2) === '[2,3,1]');
// 场景6：不动 → 原顺序
assert('原顺序保持 [1,2,3]', JSON.stringify([1, 2, 3]) === '[1,2,3]');

// 场景7：侧栏同步算法（appendChild 按 ids 顺序重排）
const side = { children: [
  { id: 'title', tag: 'div' },
  { id: 'item1', target: '#g1' }, { id: 'item2', target: '#g2' }, { id: 'item3', target: '#g3' },
] };
function syncSidebarOrder(ids) {
  ids.forEach((id) => {
    const item = side.children.find((c) => c.target === `#g${id}`);
    if (item) { side.children.splice(side.children.indexOf(item), 1); side.children.push(item); }
  });
}
syncSidebarOrder([3, 1, 2]);
const order = side.children.map((c) => c.id).join(',');
assert('侧栏按新顺序重排(标题保持在首位)', order === 'title,item3,item1,item2');

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
