// The gallery builds itself from the meta.json in each example folder, so a new
// example shows up here the moment its folder exists. Nothing to register.

const metaModules = import.meta.glob('../examples/*/meta.json', { eager: true })
const thumbModules = import.meta.glob('../examples/*/thumb.{png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const slugOf = (path) => path.split('/')[2]

function toExample([path, module]) {
  const slug = slugOf(path)
  const meta = module.default ?? module
  const thumbEntry = Object.entries(thumbModules).find(([p]) => slugOf(p) === slug)

  return {
    slug,
    seq: slug.split('-')[0],
    title: meta.title ?? slug,
    techniques: meta.techniques ?? [],
    interaction: meta.interaction ?? '—',
    stack: meta.stack ?? [],
    mood: meta.mood ?? '',
    difficulty: meta.difficulty ?? null,
    reusableAs: meta.reusable_as ?? '',
    thumb: thumbEntry?.[1] ?? null,
  }
}

const examples = Object.entries(metaModules).map(toExample).sort((a, b) => a.slug.localeCompare(b.slug))

const allTechniques = [...new Set(examples.flatMap((e) => e.techniques))].sort()
const active = new Set()

const grid = document.getElementById('grid')
const filters = document.getElementById('filters')
const empty = document.getElementById('empty')
const count = document.getElementById('count')

function cardMarkup(example) {
  const thumb = example.thumb
    ? `<img class="thumb" src="${example.thumb}" alt="" loading="lazy" />`
    : '<div class="thumb"></div>'

  const tags = example.techniques.map((t) => `<span class="tag">${t}</span>`).join('')
  const difficulty = example.difficulty ? `difficulty ${example.difficulty}` : ''

  return `
    <a class="card" href="./examples/${example.slug}/">
      ${thumb}
      <div class="card-body">
        <span class="card-head">
          <span class="seq">${example.seq}</span>
          <span class="title">${example.title}</span>
        </span>
        <p class="mood">${example.mood}</p>
        <span class="tags">${tags}</span>
        <span class="meta-row">
          <span>${example.interaction}</span>
          <span>${difficulty}</span>
        </span>
      </div>
    </a>
  `
}

const matchesFilters = (example) => [...active].every((t) => example.techniques.includes(t))

function render() {
  const visible = examples.filter(matchesFilters)

  grid.innerHTML = visible.map(cardMarkup).join('')
  empty.hidden = visible.length > 0
  count.textContent = `${visible.length} of ${examples.length} ${
    examples.length === 1 ? 'study' : 'studies'
  }`
}

function toggleTechnique(technique, button) {
  if (active.has(technique)) active.delete(technique)
  else active.add(technique)

  button.setAttribute('aria-pressed', String(active.has(technique)))
  render()
}

function renderFilters() {
  allTechniques.forEach((technique) => {
    const button = document.createElement('button')

    button.className = 'chip'
    button.type = 'button'
    button.textContent = technique
    button.setAttribute('aria-pressed', 'false')
    button.addEventListener('click', () => toggleTechnique(technique, button))

    filters.append(button)
  })
}

renderFilters()
render()
