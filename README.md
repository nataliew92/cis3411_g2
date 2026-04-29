# V&A AI Explorer (M|E Museum Explorer)

University group project for an online museum experience enhanced with AI, specifically for the Young V&A Dolls and Toys collection.

The project consists of two complementary views: a physics-driven cluster overview of the whole collection, and a detail page for inspecting individual artefacts with AI-driven object detection.

## 🚀 Current Status (April 2026)
The project is in the **final evaluation and reporting phase**.

## 🛠 Technical Features
- **AI Model:** OWL-ViT (via `Transformers.js @2.17.2`) for in-browser classification and feature detection.
- **Interface:** Physics-driven "Generous Interface" using `Matter.js`.
- **Navigation:** Supports Left-Click dragging, Scroll-to-Focus, Scroll-to-Zoom, and dynamic directional arrows.
- **Performance:** Hybrid caching strategy (`clusters.json`) for high-performance loading with a live AI demonstration pass.
- **Accessibility:** Achieved **WCAG AAA** contrast compliance across all pages.
- **Architecture:** Standard Vanilla JS/HTML5/CSS3.

## 📖 Details Page

A complementary deep-dive view that lets users browse individual artefacts and examine them in detail.

- **Object Detection**: Uses OWL-ViT zero-shot detection to identify and label features within each artefact (wheels, doll's heads, miniature windows, etc.) drawn directly onto the image as bounding boxes.
- **Confidence Tuning**: User-controlled detection threshold via slider and preset chips (Show all / Balanced / Strict) for fine-grained control over AI sensitivity.
- **Pagination**: Browses the entire V&A collection in manageable batches via the API's `page` parameter, avoiding the lag of bulk loading while still giving access to the full dataset.
- **Cross-Referencing**: Surfaces other artefacts in the same batch that share detected features, creating emergent connections between objects without requiring extra API calls.
- **Live Catalogue Data**: Displays official V&A metadata — title, system number, description, materials, and physical description — sourced live from the Collections API.
- **Visual Annotation**: Bounding boxes rendered on an HTML5 canvas alongside the original image, scaled responsively while preserving spatial accuracy.

## 👥 The Team
- Natalie Wilkinson
- David Opoku
- Craig Jones
- Greta Ivanovaite
