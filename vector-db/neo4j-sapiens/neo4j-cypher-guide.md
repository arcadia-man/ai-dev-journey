# Neo4j Cypher Query Guide
## Based on the Sapiens RAG Graph

---

## Graph Schema (what lives in your DB)

```
(:Document)
    └──[:HAS_PART]──▶ (:Part)
                           └──[:HAS_CHAPTER]──▶ (:Chapter)
                                                     └──[:HAS_SECTION]──▶ (:Section)
                                                                               └──[:HAS_CHILD]──▶ (:Chunk)
                                                                               └──[:NEXT_CHILD]──▶ (:Chunk)
(:Chunk)──[:IN_SECTION]──▶ (:Section)
(:Section)──[:REFERENCES]──▶ (:Chapter)
(:Chunk | :Section)──[:MENTIONS]──▶ (:Entity)
```

**Node properties at a glance**

| Node | Key properties |
|---|---|
| `Document` | `id`, `title` |
| `Part` | `id`, `number`, `title`, `documentId` |
| `Chapter` | `id`, `number`, `title`, `documentId` |
| `Section` | `id`, `title`, `documentId`, `chapterTitle`, `partTitle`, `pageStart`, `pageEnd`, `content`, `embedding` |
| `Chunk` | `id`, `documentId`, `chapterTitle`, `sectionTitle`, `pageStart`, `pageEnd`, `content`, `embedding`, `chunkIndex`, `childIndex` |
| `Entity` | `id`, `name` |

---

---

## Q1 — What nodes exist in the graph?

**Explanation**

Before writing any query you need to see what labels (node types) are stored.
Neo4j keeps a catalogue of all labels used across all nodes.
`CALL db.labels()` is the entry point — think of it like `SHOW TABLES` in SQL.

**Available thing and intuition**

- Every node in Neo4j has one or more *labels* (like a type tag: `Document`, `Chunk`, etc.).
- `CALL` runs a built-in procedure, `YIELD` picks which columns you want from the result.
- The result is just a list of strings — one per label found in the DB.

```cypher
CALL db.labels()
YIELD label
RETURN label
ORDER BY label
```

**Expected result**
```
Chapter, Chunk, Document, Entity, Part, Section
```

---

## Q2 — What relationship types exist?

**Explanation**

Relationships are the edges between nodes.
Knowing what relationship types exist tells you how nodes are connected
and what traversals you can do.

**Available thing and intuition**

- `db.relationshipTypes()` is the counterpart to `db.labels()`.
- Every relationship in Neo4j has exactly one type (like `HAS_CHAPTER`, `MENTIONS`).
- This is your map before you write any `MATCH` with arrows.

```cypher
CALL db.relationshipTypes()
YIELD relationshipType
RETURN relationshipType
ORDER BY relationshipType
```

**Expected result**
```
HAS_CHILD, HAS_CHAPTER, HAS_PART, HAS_SECTION, IN_SECTION,
MENTIONS, NEXT_CHILD, REFERENCES
```

---

## Q3 — Count how many nodes of each type exist

**Explanation**

`COUNT(*)` counts how many rows matched.
Here we run it once per label.
This tells you the size of your data — e.g. "how many chunks were seeded?"

**Available thing and intuition**

- `MATCH (n:Label)` finds all nodes with that label.
- `RETURN COUNT(n)` gives the total.
- You can rename columns with `AS` to make output readable.
- Run each line separately in the UI.

```cypher
MATCH (n:Document) RETURN COUNT(n) AS documents;
MATCH (n:Part)     RETURN COUNT(n) AS parts;
MATCH (n:Chapter)  RETURN COUNT(n) AS chapters;
MATCH (n:Section)  RETURN COUNT(n) AS sections;
MATCH (n:Chunk)    RETURN COUNT(n) AS chunks;
MATCH (n:Entity)   RETURN COUNT(n) AS entities;
```

---

## Q4 — See the full Document node

**Explanation**

`MATCH` finds nodes, `RETURN` outputs them.
When you return the node variable directly (not a property), the UI shows
all its properties as a card or row.

**Available thing and intuition**

- `(d:Document)` — `d` is just a variable name, `:Document` is the label filter.
- No `WHERE` clause means "all nodes with this label".
- `RETURN d` returns the whole node object; `RETURN d.title` would return just the title string.

```cypher
MATCH (d:Document)
RETURN d
```

---

## Q5 — List all 4 Parts with their numbers and titles

**Explanation**

Accessing individual *properties* of a node with dot-notation: `node.propertyName`.
`ORDER BY` sorts the output.

**Available thing and intuition**

- `p.number`, `p.title` — dot access, same idea as `object.field` in JavaScript.
- `ORDER BY p.number ASC` sorts numerically ascending (1 → 4).
- This is like `SELECT number, title FROM parts ORDER BY number` in SQL.

```cypher
MATCH (p:Part)
RETURN p.number AS partNumber, p.title AS partTitle
ORDER BY p.number ASC
```

---

## Q6 — List all 20 chapters with their part

**Explanation**

This is your first **graph traversal** — following a relationship from one
node to another. Here we walk `Part → Chapter` using the `[:HAS_CHAPTER]` edge.

**Available thing and intuition**

- `(p:Part)-[:HAS_CHAPTER]->(c:Chapter)` means: find a Part `p` that has a
  `HAS_CHAPTER` relationship pointing to a Chapter `c`.
- The arrow direction matters: `->` means the relationship goes from left to right.
- This joins two node types without a foreign key — the graph edge *is* the relationship.

```cypher
MATCH (p:Part)-[:HAS_CHAPTER]->(c:Chapter)
RETURN p.number AS part, p.title AS partTitle,
       c.number AS chapter, c.title AS chapterTitle
ORDER BY c.number ASC
```

---

## Q7 — Find all sections inside a specific chapter

**Explanation**

Add a `WHERE` clause to filter by a property value.
This is the equivalent of SQL's `WHERE column = 'value'`.

**Available thing and intuition**

- `WHERE c.title = 'The Flood'` filters to only the chapter with that exact title.
- The path `(c:Chapter)-[:HAS_SECTION]->(s:Section)` walks one more hop.
- `s.pageStart` and `s.pageEnd` show which pages the section spans.

```cypher
MATCH (c:Chapter)-[:HAS_SECTION]->(s:Section)
WHERE c.title = 'The Flood'
RETURN s.title AS section, s.pageStart AS from, s.pageEnd AS to
ORDER BY s.pageStart
```

---

## Q8 — Find all child chunks for a section

**Explanation**

Walking down one more level: `Section → Chunk` using `[:HAS_CHILD]`.
This is the parent-child retrieval pattern at the heart of the RAG pipeline.

**Available thing and intuition**

- A `Section` is the *parent* (full section text).
- Each `Chunk` is a *child* (one or two paragraphs).
- `c.childIndex` tells you the order of the child within its parent section.

```cypher
MATCH (s:Section)-[:HAS_CHILD]->(c:Chunk)
WHERE s.title = 'Introduction'
RETURN c.chunkIndex  AS globalIndex,
       c.childIndex  AS positionInSection,
       c.content     AS text
ORDER BY c.childIndex
```

---

## Q9 — Walk the full hierarchy: Document → Part → Chapter → Section

**Explanation**

Chaining multiple hops in a single `MATCH`.
Every `->` is one hop. Neo4j evaluates this as a single pattern, not multiple joins.

**Available thing and intuition**

- You can chain as many hops as you want in one `MATCH`.
- This returns one row per path found — so if a chapter has 5 sections you get 5 rows.
- Think of it as: "give me every combination of (part, chapter, section) that is connected correctly."

```cypher
MATCH (d:Document)-[:HAS_PART]->(p:Part)
      -[:HAS_CHAPTER]->(c:Chapter)
      -[:HAS_SECTION]->(s:Section)
WHERE d.id = 'sapiens'
RETURN p.number AS part, c.number AS chapter,
       c.title  AS chapterTitle, s.title AS section,
       s.pageStart AS page
ORDER BY c.number, s.pageStart
LIMIT 30
```

---

## Q10 — Find sections that mention a specific entity

**Explanation**

Traversing the entity graph: find all `Section` nodes that have a
`[:MENTIONS]` edge to an `Entity` whose name matches.
This is entity-aware retrieval.

**Available thing and intuition**

- `CONTAINS` is a substring check in Cypher.
- `toLower()` converts to lowercase so matching is case-insensitive.
- The `[:MENTIONS]` edge was created by `compromise` NLP during seeding
  for every person/place detected.

```cypher
MATCH (s:Section)-[:MENTIONS]->(e:Entity)
WHERE toLower(e.name) CONTAINS 'napoleon'
RETURN s.chapterTitle AS chapter,
       s.title        AS section,
       s.pageStart    AS page,
       e.name         AS entity
ORDER BY s.pageStart
```

---

## Q11 — Find which sections reference a specific chapter

**Explanation**

Querying the `[:REFERENCES]` edges created from cross-reference detection
("see Chapter 4", "as noted in Chapter 12").
This is explicit link traversal.

**Available thing and intuition**

- `[:REFERENCES]` edges go from a `Section` to a `Chapter`.
- These were auto-detected from text patterns like "see Chapter N" during seeding.
- The relationship has a `raw` property — the actual phrase that triggered the link.

```cypher
MATCH (s:Section)-[r:REFERENCES]->(c:Chapter)
WHERE c.number = 4
RETURN s.chapterTitle AS fromChapter,
       s.title        AS fromSection,
       r.raw          AS phrase,
       s.pageStart    AS page
ORDER BY s.pageStart
```

---

## Q12 — Get previous and next sibling chunks (context window)

**Explanation**

The `[:NEXT_CHILD]` relationship chains chunks in reading order.
Using `OPTIONAL MATCH` means "try to find this, but don't fail the row if
it doesn't exist" — handles the first and last chunks gracefully.

**Available thing and intuition**

- `OPTIONAL MATCH` is like a `LEFT JOIN` in SQL — it returns `null` if no
  match, rather than dropping the row.
- This is the *expanded context* pattern: retrieve the target chunk plus
  the one before and after.
- Change the `id` value to any chunk id you found from Q8.

```cypher
MATCH (c:Chunk { id: 'sapiens:chunk:10' })
OPTIONAL MATCH (prev:Chunk)-[:NEXT_CHILD]->(c)
OPTIONAL MATCH (c)-[:NEXT_CHILD]->(next:Chunk)
RETURN prev.content AS previousChunk,
       c.content    AS thisChunk,
       next.content AS nextChunk
```

---

## Q13 — Count how many chunks mention each entity (top 20)

**Explanation**

Aggregation in Cypher. `COUNT(c)` counts the number of chunk nodes `c`
grouped by each entity.
`ORDER BY ... DESC LIMIT 20` gives you the most-mentioned entities.

**Available thing and intuition**

- Any column NOT inside an aggregation function (`COUNT`, `SUM`, `AVG`)
  becomes a `GROUP BY` key automatically — no explicit `GROUP BY` needed.
- `LIMIT` always goes at the end, after `ORDER BY`.
- This tells you which real-world entities the book talks about most.

```cypher
MATCH (c:Chunk)-[:MENTIONS]->(e:Entity)
RETURN e.name AS entity, COUNT(c) AS mentionCount
ORDER BY mentionCount DESC
LIMIT 20
```

---

## Q14 — Find sections that share a common entity (entity co-mention)

**Explanation**

This is the **multi-hop** pattern.
Start from one section, walk to a shared entity, then walk back to all
*other* sections that mention the same entity.
This is how the pipeline discovers related content across distant chapters.

**Available thing and intuition**

- You can traverse *through* a node: `(a)-[:MENTIONS]->(e)<-[:MENTIONS]-(b)`.
- The `<-` arrow reverses direction — "b mentions e" reads right-to-left.
- `WHERE a <> b` prevents matching a section with itself.

```cypher
MATCH (a:Section)-[:MENTIONS]->(e:Entity)<-[:MENTIONS]-(b:Section)
WHERE a.id = 'sapiens:section:10'
  AND a <> b
RETURN b.chapterTitle AS relatedChapter,
       b.title        AS relatedSection,
       e.name         AS sharedEntity,
       b.pageStart    AS page
ORDER BY b.pageStart
LIMIT 15
```

---

## Q15 — Count sections per chapter

**Explanation**

Aggregation across a relationship.
Group all sections by the chapter they belong to and count them.
Tells you which chapters are subdivided most finely.

**Available thing and intuition**

- The `MATCH` path defines the grouping automatically.
- `COUNT(s)` counts section nodes per chapter.
- Good pattern for understanding data distribution before writing retrieval logic.

```cypher
MATCH (c:Chapter)-[:HAS_SECTION]->(s:Section)
RETURN c.number AS chapterNum,
       c.title  AS chapter,
       COUNT(s) AS sectionCount
ORDER BY c.number
```

---

## Q16 — Find sections that span the most pages

**Explanation**

Computing a derived value (`pageEnd - pageStart`) inside the query using
arithmetic. The result is used in `ORDER BY` to rank sections by length.

**Available thing and intuition**

- You can do arithmetic directly in `RETURN` or `ORDER BY`:
  `s.pageEnd - s.pageStart`.
- `AS span` names the computed column.
- This reveals which sections are long (likely important, broad topics).

```cypher
MATCH (s:Section)
WHERE s.documentId = 'sapiens'
RETURN s.chapterTitle AS chapter,
       s.title        AS section,
       s.pageStart    AS from,
       s.pageEnd      AS to,
       (s.pageEnd - s.pageStart) AS span
ORDER BY span DESC
LIMIT 10
```

---

## Q17 — Full-text content search with CONTAINS

**Explanation**

Searching inside string properties.
`CONTAINS` checks if a substring appears anywhere in the value.
This is basic keyword search — useful to verify content was ingested correctly.

**Available thing and intuition**

- `toLower(s.content) CONTAINS 'agricultural revolution'` — normalise both
  sides to avoid case mismatch.
- This is a full scan (no index) — fine for hundreds of sections.
- Compare it with the BM25 search the app does — this is the naive version.

```cypher
MATCH (s:Section)
WHERE toLower(s.content) CONTAINS 'agricultural revolution'
RETURN s.chapterTitle AS chapter,
       s.title        AS section,
       s.pageStart    AS page,
       substring(s.content, 0, 200) AS preview
ORDER BY s.pageStart
LIMIT 10
```

---

## Q18 — Trace the complete ancestry of a chunk

**Explanation**

Walk *upward* through the graph: `Chunk → Section → Chapter → Part → Document`.
This is the inverse of the seeding path —
"given a chunk, where does it live in the book hierarchy?"

**Available thing and intuition**

- `(c:Chunk)-[:IN_SECTION]->(s:Section)` — `IN_SECTION` is the edge from
  chunk back to its parent section.
- You then jump to chapter via `(chap:Chapter)-[:HAS_SECTION]->(s)` —
  note the direction is still `chap → s`.
- This is the *document-aware indexing* feature: every chunk knows its
  full address in the book.

```cypher
MATCH (c:Chunk)-[:IN_SECTION]->(s:Section)
MATCH (chap:Chapter)-[:HAS_SECTION]->(s)
MATCH (p:Part)-[:HAS_CHAPTER]->(chap)
MATCH (d:Document)-[:HAS_PART]->(p)
WHERE c.id = 'sapiens:chunk:50'
RETURN d.title    AS document,
       p.title    AS part,
       chap.title AS chapter,
       s.title    AS section,
       c.pageStart AS page,
       substring(c.content, 0, 150) AS preview
```

---

## Q19 — Find all sections reachable by cross-reference hop

**Explanation**

Multi-hop path query.
Follow `[:REFERENCES]` from a section to a chapter, then `[:HAS_SECTION]`
to reach all sections inside that referenced chapter.
This is how the pipeline finds indirectly connected evidence.

**Available thing and intuition**

- Two separate `MATCH` hops chained: section → chapter → sections-of-chapter.
- `DISTINCT` collapses duplicate paths that reach the same destination
  via different routes.
- Change `sapiens:section:5` to any section id from your graph.

```cypher
MATCH (start:Section { id: 'sapiens:section:5' })
      -[:REFERENCES]->(c:Chapter)
      -[:HAS_SECTION]->(reached:Section)
WHERE reached.id <> start.id
RETURN DISTINCT
       reached.chapterTitle AS chapter,
       reached.title        AS section,
       reached.pageStart    AS page,
       c.title              AS viaChapter
ORDER BY reached.pageStart
LIMIT 20
```

---

## Q20 — Inspect a chunk's embedding vector

**Explanation**

The `embedding` property is a `float[]` array — the 768-dimensional vector
from `nomic-embed-text`. Slicing it with `[0..10]` lets you inspect its
shape without flooding the screen.

**Available thing and intuition**

- `property[start..end]` — Cypher list slicing, same idea as Python `arr[0:10]`.
- The vector is what the cosine similarity search runs over at query time.
- Seeing real numbers confirms the embedding was stored correctly during seeding.
- `size(c.embedding)` tells you the dimension count (should be `768`).

```cypher
MATCH (c:Chunk { id: 'sapiens:chunk:0' })
RETURN c.id                AS chunkId,
       c.sectionTitle      AS section,
       size(c.embedding)   AS dimensions,
       c.embedding[0..10]  AS first10Dimensions
```

---

## Quick Reference Card

```cypher
-- All labels
CALL db.labels() YIELD label RETURN label

-- All relationship types
CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType

-- Count any node type
MATCH (n:Chunk) RETURN COUNT(n)

-- Filter by property
WHERE n.property = 'value'
WHERE n.number > 5
WHERE toLower(n.content) CONTAINS 'keyword'

-- Traverse one hop
MATCH (a:Chapter)-[:HAS_SECTION]->(b:Section)

-- Traverse multiple hops
MATCH (a)-[:HAS_PART]->(b)-[:HAS_CHAPTER]->(c)

-- Optional match (LEFT JOIN equivalent)
OPTIONAL MATCH (prev)-[:NEXT_CHILD]->(c)

-- Aggregate and group
RETURN e.name, COUNT(c) AS total ORDER BY total DESC LIMIT 10

-- Slice an array property
RETURN c.embedding[0..5]

-- Arithmetic on properties
RETURN (s.pageEnd - s.pageStart) AS span
```
