# Recoil interface direction

## Visual idea

Recoil is a measured wayfinding tool for public evidence. The interface should
feel like a clear technical drawing: a reviewer can follow an advisory through
resolution, lockfile, repository, and source evidence without learning a
dashboard vocabulary.

The visual system is intentionally light, quiet, and evidence-first. The graph
is an inspection surface, not decoration. The report gives the decision before
the topology, and every result is phrased from collected evidence rather than
from simulated confidence.

## System

- **Canvas:** pale cool neutral, with an opaque header and no glass, gradients,
  textures, or decorative shadows.
- **Ink:** near-black blue-green for decisions; muted blue-green for supporting
  copy.
- **Accent:** one restrained teal for selected routes, links, focus, and
  progress.
- **Semantics:** green means a verified safe/outside-range result; red means a
  source-backed affected path; neutral means declared, unknown, or incomplete.
- **Surfaces:** use one-pixel rules, whitespace, and alignment before adding a
  container. A bordered surface exists only when it groups an inspectable
  object such as the map or input.
- **Corners:** small, consistent four-to-five pixel corners for controls and
  inputs; route diagrams and report sections remain square and flat.

## Type

The application uses one sans family for interface language and reserves the
monospace family for identifiers, package names, versions, paths, and source
snippets. Headings are compact and readable, never poster-sized. Section labels
are sentence case and used only where they help locate evidence.

## Layout rules

1. The landing view asks for one investigation and keeps the input as the
   primary object.
2. The live view puts the current event and four evidence phases beside the
   observed graph. It does not show fake agent telemetry.
3. The report order is: decision, repository outcome index, selected route,
   inspection tabs, then detailed evidence.
4. The graph is always contained in its own scroll viewport. It may be wider
   than a phone, but it must never widen the document.
5. On small screens, stage navigation and case tabs scroll horizontally while
   evidence content becomes one readable column.

## Motion

The authored motion is route arrival: a selected evidence path settles into
place with a short ease-out. Live evidence may appear progressively, but there
are no decorative pulses, bouncing agents, or perpetual dashboard animation.
Reduced-motion users receive the same state changes without movement.

## Product boundary

Do not add visual language that implies package installation, exploit execution,
runtime reachability, or a verified fix unless the existing evidence engine
actually produced that fact. Recoil's strongest visual claim is the one it can
open to a source.
