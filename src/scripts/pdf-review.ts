import type {
  PdfCandidate,
  PdfCandidateCatalog,
  PdfReviewDecision,
  ReviewAction,
} from '@/lib/pdf-review';

type DecisionFile = { version: number; reviewedBy: string; decisions: Record<string, PdfReviewDecision> };

const root = document.querySelector<HTMLElement>('[data-pdf-review]');

if (root) {
  const summary = root.querySelector<HTMLElement>('[data-review-summary]')!;
  const notice = root.querySelector<HTMLElement>('[data-review-notice]')!;
  const workspace = root.querySelector<HTMLElement>('[data-review-workspace]')!;
  const list = root.querySelector<HTMLElement>('[data-review-list]')!;
  const queueCount = root.querySelector<HTMLElement>('[data-queue-count]')!;
  const form = root.querySelector<HTMLFormElement>('[data-review-form]')!;
  const sourceImage = root.querySelector<HTMLImageElement>('[data-source-image]')!;
  const sourceLocation = root.querySelector<HTMLElement>('[data-source-location]')!;
  const sourceAudit = root.querySelector<HTMLElement>('[data-source-audit]')!;
  const currentIndex = root.querySelector<HTMLElement>('[data-current-index]')!;
  const currentState = root.querySelector<HTMLElement>('[data-current-state]')!;
  const diff = root.querySelector<HTMLElement>('[data-review-diff]')!;
  const search = root.querySelector<HTMLInputElement>('[data-filter-search]')!;
  const scope = root.querySelector<HTMLSelectElement>('[data-filter-scope]')!;
  const batch = root.querySelector<HTMLSelectElement>('[data-filter-batch]')!;
  const year = root.querySelector<HTMLSelectElement>('[data-filter-year]')!;
  const confidence = root.querySelector<HTMLSelectElement>('[data-filter-confidence]')!;
  const stateFilter = root.querySelector<HTMLSelectElement>('[data-filter-state]')!;
  const imageMode = root.querySelector<HTMLSelectElement>('[data-image-mode]')!;
  const titleInput = form.elements.namedItem('title') as HTMLInputElement;
  const dateInput = form.elements.namedItem('writtenDate') as HTMLInputElement;
  const typeInput = form.elements.namedItem('candidateType') as HTMLSelectElement;
  const bodyInput = form.elements.namedItem('body') as HTMLTextAreaElement;
  const reasonInput = form.elements.namedItem('reason') as HTMLTextAreaElement;

  let catalog: PdfCandidateCatalog;
  let decisions: DecisionFile;
  let filtered: PdfCandidate[] = [];
  let selectedId = '';
  let selectedAction: ReviewAction | '' = '';
  let dirty = false;

  const escapeHtml = (value: unknown) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  function option(value: string, label = value) {
    return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
  }

  function currentCandidate() {
    return catalog.candidates.find((candidate) => candidate.candidateId === selectedId);
  }

  function currentDecision(candidate: PdfCandidate) {
    return decisions.decisions[candidate.candidateId] ?? candidate.decision ?? null;
  }

  function effectiveState(candidate: PdfCandidate) {
    const decision = currentDecision(candidate);
    if (decision?.action === 'hold') return 'held';
    if (decision?.action === 'reject') return 'rejected';
    if (decision?.action === 'approve' || decision?.action === 'correct') return 'manually-approved';
    return candidate.publicationState;
  }

  function populateFilters() {
    const batches = [...new Set(catalog.candidates.map((candidate) => candidate.reviewBatchId))];
    const years = [...new Set(catalog.candidates.map((candidate) => candidate.writtenDate?.slice(0, 4)).filter(Boolean) as string[])].sort().reverse();
    const states = [...new Set(catalog.candidates.map(effectiveState))].sort();
    batch.insertAdjacentHTML('beforeend', batches.map((value) => option(value)).join(''));
    year.insertAdjacentHTML('beforeend', years.map((value) => option(value)).join(''));
    stateFilter.insertAdjacentHTML('beforeend', states.map((value) => option(value)).join(''));
  }

  function matches(candidate: PdfCandidate) {
    const text = `${candidate.title}\n${candidate.body}\n${candidate.pdfPage}`.toLowerCase();
    const exception = candidate.confidence !== 'high';
    return (scope.value === 'all' || exception)
      && (batch.value === 'all' || candidate.reviewBatchId === batch.value)
      && (year.value === 'all' || candidate.writtenDate?.startsWith(year.value))
      && (confidence.value === 'all' || candidate.confidence === confidence.value)
      && (stateFilter.value === 'all' || effectiveState(candidate) === stateFilter.value)
      && (!search.value.trim() || text.includes(search.value.trim().toLowerCase()));
  }

  function renderList(preferredId = selectedId) {
    filtered = catalog.candidates.filter(matches);
    queueCount.textContent = `${filtered.length} 个候选`;
    list.innerHTML = filtered.map((candidate, index) => `
      <button class="pdf-review__candidate" type="button" data-candidate-id="${candidate.candidateId}" aria-current="${candidate.candidateId === preferredId}">
        <small>${String(index + 1).padStart(3, '0')}</small>
        <strong>${escapeHtml(candidate.title)}</strong>
        <em>PDF ${candidate.pdfPage} · ${candidate.region} #${candidate.regionSequence} · ${candidate.confidence} · ${escapeHtml(effectiveState(candidate))}</em>
      </button>
    `).join('');
    list.querySelectorAll<HTMLButtonElement>('[data-candidate-id]').forEach((button) => {
      button.addEventListener('click', () => selectCandidate(button.dataset.candidateId ?? ''));
    });
    const next = filtered.find((candidate) => candidate.candidateId === preferredId) ?? filtered[0];
    if (next) selectCandidate(next.candidateId, true);
    else {
      selectedId = '';
      form.reset();
      currentIndex.textContent = '没有符合条件的候选';
      sourceImage.removeAttribute('src');
    }
  }

  function formChanged(candidate: PdfCandidate) {
    return titleInput.value.trim() !== candidate.title
      || dateInput.value !== (candidate.writtenDate ?? '')
      || typeInput.value !== candidate.candidateType
      || bodyInput.value.trim() !== candidate.body.trim();
  }

  function updateDiff() {
    const candidate = currentCandidate();
    if (!candidate) return;
    dirty = formChanged(candidate) || selectedAction !== (currentDecision(candidate)?.action ?? '') || reasonInput.value.trim() !== (currentDecision(candidate)?.reason ?? '');
    const fields = [
      titleInput.value.trim() !== candidate.title && '标题',
      dateInput.value !== (candidate.writtenDate ?? '') && '日期',
      typeInput.value !== candidate.candidateType && '分类',
      bodyInput.value.trim() !== candidate.body.trim() && '正文',
    ].filter(Boolean);
    diff.textContent = fields.length ? `已修改：${fields.join('、')}` : '当前字段与原始抽取一致';
  }

  function setAction(action: ReviewAction | '') {
    selectedAction = action;
    root!.querySelectorAll<HTMLButtonElement>('[data-review-action]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.reviewAction === action));
    });
    updateDiff();
  }

  function selectCandidate(candidateId: string, force = false) {
    if (!force && dirty && candidateId !== selectedId && !window.confirm('当前修改尚未保存，确定离开吗？')) return;
    const candidate = catalog.candidates.find((item) => item.candidateId === candidateId);
    if (!candidate) return;
    selectedId = candidateId;
    dirty = false;
    const decision = currentDecision(candidate);
    const corrections = decision?.corrections;
    titleInput.value = corrections?.title ?? candidate.title;
    bodyInput.value = corrections?.body ?? candidate.body;
    dateInput.value = corrections?.writtenDate ?? candidate.writtenDate ?? '';
    typeInput.value = corrections?.candidateType ?? candidate.candidateType;
    reasonInput.value = decision?.reason ?? '';
    setAction(decision?.action ?? '');
    sourceLocation.textContent = `PDF ${candidate.pdfPage} · ${candidate.region} #${candidate.regionSequence}`;
    sourceImage.src = imageMode.value === 'page' ? candidate.pageImage : candidate.cropImage;
    sourceImage.alt = `${candidate.title} 的 PDF ${imageMode.value === 'page' ? '整页' : '裁图'}`;
    currentIndex.textContent = `${filtered.findIndex((item) => item.candidateId === candidateId) + 1} / ${filtered.length}`;
    currentState.textContent = `${candidate.confidence} · ${effectiveState(candidate)}`;
    sourceAudit.innerHTML = [
      ['候选 ID', candidate.candidateId],
      ['批次', candidate.reviewBatchId],
      ['日期', candidate.writtenDate ?? '无'],
      ['类型', candidate.candidateType],
      ['模板', `${candidate.layoutTemplate} / ${candidate.layoutTemplateStatus}`],
      ['裁图一致', String(candidate.cropAgreement)],
      ['失败原因', candidate.failureReasons.join(', ') || 'none'],
      ['内容指纹', candidate.contentFingerprint],
    ].map(([term, value]) => `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd>`).join('');
    list.querySelectorAll<HTMLButtonElement>('[data-candidate-id]').forEach((button) => {
      button.setAttribute('aria-current', String(button.dataset.candidateId === candidateId));
    });
    updateDiff();
  }

  function move(delta: number) {
    const index = filtered.findIndex((candidate) => candidate.candidateId === selectedId);
    if (index < 0) return;
    const next = filtered[index + delta];
    if (next) selectCandidate(next.candidateId);
  }

  async function saveDecision(event: SubmitEvent) {
    event.preventDefault();
    const candidate = currentCandidate();
    if (!candidate || !selectedAction) {
      notice.textContent = '请先选择审核决定。';
      return;
    }
    if ((selectedAction === 'hold' || selectedAction === 'reject') && !reasonInput.value.trim()) {
      notice.textContent = '搁置和排除必须填写理由。';
      return;
    }
    const payload = {
      candidateId: candidate.candidateId,
      action: selectedAction,
      reason: reasonInput.value.trim(),
      corrections: selectedAction === 'correct' ? {
        title: titleInput.value.trim(),
        body: bodyInput.value.trim(),
        writtenDate: dateInput.value,
        candidateType: typeInput.value,
      } : undefined,
    };
    const response = await fetch('/__pdf-review/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      notice.textContent = result.error ?? '保存失败；当前表单仍保留。';
      return;
    }
    decisions.decisions[candidate.candidateId] = result.decision;
    dirty = false;
    notice.textContent = `已保存《${candidate.title}》：${result.decision.action}`;
    renderList(candidate.candidateId);
    move(1);
  }

  async function initialize() {
    try {
      const [catalogResponse, decisionResponse] = await Promise.all([
        fetch('/__pdf-review/catalog', { cache: 'no-store' }),
        fetch('/__pdf-review/decisions', { cache: 'no-store' }),
      ]);
      if (!catalogResponse.ok) throw new Error('候选目录不存在。请先运行 PDF catalog 生成命令。');
      catalog = await catalogResponse.json();
      decisions = decisionResponse.ok ? await decisionResponse.json() : { version: 1, reviewedBy: 'site-owner', decisions: {} };
      summary.textContent = `${catalog.summary.catalogCandidates} 个目录候选 · ${catalog.summary.highConfidence} 个 high · ${catalog.summary.reviewExceptions} 个待审核 · 规则 ${catalog.rulesVersion}`;
      populateFilters();
      workspace.hidden = false;
      notice.textContent = '';
      renderList();
    } catch (error) {
      notice.textContent = `${error instanceof Error ? error.message : '读取失败'} 运行：python3 scripts/build_pdf_catalog.py --render`;
      summary.textContent = '审核台尚未准备好';
    }
  }

  [search, scope, batch, year, confidence, stateFilter].forEach((control) => {
    control.addEventListener(control === search ? 'input' : 'change', () => renderList());
  });
  imageMode.addEventListener('change', () => {
    const candidate = currentCandidate();
    if (candidate) selectCandidate(candidate.candidateId, true);
  });
  form.addEventListener('input', updateDiff);
  form.addEventListener('submit', saveDecision);
  root.querySelectorAll<HTMLButtonElement>('[data-review-action]').forEach((button) => {
    button.addEventListener('click', () => setAction(button.dataset.reviewAction as ReviewAction));
  });
  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement;
    if (target.matches('input, textarea, select')) return;
    if (event.key.toLowerCase() === 'j') move(1);
    if (event.key.toLowerCase() === 'k') move(-1);
    const actions: Record<string, ReviewAction> = { '1': 'approve', '2': 'correct', '3': 'hold', '4': 'reject' };
    if (actions[event.key]) setAction(actions[event.key]);
  });

  void initialize();
}
