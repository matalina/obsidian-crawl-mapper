import { MarkdownRenderChild, Menu, Notice } from 'obsidian';
import type CrawlMapperPlugin from './main';
import { TextMapperParser } from './text-mapper/parser';
import { Point } from './text-mapper/orientation';
import { buildThemeLines, findMissingIcons, getIconPacksFromSource, parseIconPackList } from './icon-packs';
import { textMapperSourceIsDungeon } from './text-mapper/dungeon-detect';
import { textMapperSourceIsCity } from './text-mapper/city-detect';
import { OPTION_REGEX, SVGElement as CustomSVGElement } from './text-mapper/constants';

/**
 * Extract zoom option from source code if present
 * @param source The map source code
 * @returns Zoom value if found, null otherwise
 */
function getZoomFromSource(source: string): number | null {
  const lines = source.split('\n');
  for (const line of lines) {
    if (line.startsWith('#')) {
      continue;
    }
    if (OPTION_REGEX.test(line)) {
      const match = line.match(OPTION_REGEX);
      if (match) {
        const optionStr = match[1].trim();
        const tokens = optionStr.split(' ');
        if (tokens.length >= 2 && tokens[0] === 'zoom') {
          const zoomValue = parseFloat(tokens[1]);
          if (!isNaN(zoomValue) && zoomValue > 0) {
            return zoomValue;
          }
        }
      }
    }
  }
  return null;
}

export class CrawlMap extends MarkdownRenderChild {
  mapEl: HTMLDivElement;
  svgEl: CustomSVGElement | null = null;
  svgDomElement: SVGSVGElement | null = null;
  parser: TextMapperParser | null = null;
  plugin: CrawlMapperPlugin;
  private source: string;
  readonly docId: string;
  readonly sourcePath: string;

  // Pan and zoom state
  panX = 0;
  panY = 0;
  zoom = 1.0;
  isDragging = false;
  dragStartX = 0;
  dragStartY = 0;
  dragStartPanX = 0;
  dragStartPanY = 0;

  // Touch state
  touchStartX = 0;
  touchStartY = 0;
  touchStartPanX = 0;
  touchStartPanY = 0;

  // Content bounds for pan limits
  contentBounds: { minX: number; maxX: number; minY: number; maxY: number } | null = null;

  // Fixed viewBox dimensions
  fixedViewBoxWidth = 800;
  fixedViewBoxHeight = 600;

  // Zoom limits
  minZoom = 0.5;
  maxZoom = 4.0;

  constructor(containerEl: HTMLElement, docId: string, source: string, plugin: CrawlMapperPlugin, sourcePath?: string) {
    super(containerEl);
    this.plugin = plugin;
    this.source = source;
    this.docId = docId;
    this.sourcePath = sourcePath || '';
    this.mapEl = this.containerEl.createDiv({ cls: 'crawl-mapper' });

    this.render();

    // Register with plugin
    plugin.registerMapper(this);
  }

  onunload() {
    // Unregister from plugin
    this.plugin.unregisterMapper(this);
    super.onunload();
  }

  refresh() {
    // Only maps without their own `option icons` follow the default packs setting
    if (getIconPacksFromSource(this.source) === null) {
      // Reset pan and zoom state
      this.panX = 0;
      this.panY = 0;
      this.zoom = 1.0;
      this.isDragging = false;

      this.mapEl.empty();
      this.render();
    }
  }

  private render() {
    // Icon packs: the map's own `option icons …`, else the plugin default
    const selection = parseIconPackList(getIconPacksFromSource(this.source) ?? this.plugin.settings.defaultIconPacks);

    // Dungeon and city maps draw their own tiles and use no theme
    const useTheme = !textMapperSourceIsDungeon(this.source) && !textMapperSourceIsCity(this.source);
    const totalSource = useTheme
      ? buildThemeLines(selection.packs).concat(this.source.split('\n'))
      : this.source.split('\n');

    this.parser = new TextMapperParser(this.docId);
    this.parser.process(totalSource);
    this.svgEl = this.parser.svg(this.mapEl);

    // Get the actual DOM element
    this.svgDomElement = this.mapEl.querySelector('svg');

    // Get content bounds for pan limits
    this.contentBounds = this.parser.getContentBounds();

    // Extract and apply zoom option from source
    const zoomFromSource = getZoomFromSource(this.source);
    if (zoomFromSource !== null) {
      // Apply zoom, respecting min/max limits
      this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoomFromSource));
    }

    // Setup event handlers
    this.setupEventHandlers();

    // Set initial cursor style and update viewBox
    if (this.svgDomElement) {
      this.svgDomElement.setCssStyles({ cursor: 'grab' });
      // Ensure initial viewBox is set correctly with the configured zoom
      this.updateViewBox();

      // Apply overlay visibility state from settings
      this.applyOverlayVisibility();
    }

    if (useTheme) this.renderIconNote(selection.unknown);
  }

  /** Say which icon names didn't resolve, instead of silently drawing nothing. */
  private renderIconNote(unknownPacks: string[]) {
    if (!this.parser) return;
    const problems: string[] = [];
    if (unknownPacks.length > 0) {
      problems.push(`Unknown icon packs: ${unknownPacks.join(', ')}.`);
    }
    const missing = findMissingIcons(this.parser);
    if (missing.length > 0) {
      const names = missing.map(({ name, pack }) => (pack ? `${name} (in ${pack})` : name));
      problems.push(`Not in the loaded icon packs: ${names.join(', ')}.`);
    }
    if (problems.length > 0) {
      this.mapEl.createDiv({ cls: 'crawl-mapper-note', text: problems.join(' ') });
    }
  }

  applyOverlayVisibility() {
    if (!this.svgDomElement || !this.parser) return;

    // Find the overlays group using the namespace
    const overlaysId = this.parser.options.global ? 'overlays' : `overlays-${this.parser.id}`;
    const overlaysEl = this.svgDomElement.querySelector<SVGGElement>(`#${overlaysId}`);

    if (overlaysEl) {
      overlaysEl.style.display = this.plugin.settings.overlaysVisible ? '' : 'none';
    }
  }

  setupEventHandlers() {
    if (!this.svgDomElement) return;

    const svgElement = this.svgDomElement;

    // Mouse events for panning
    svgElement.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    svgElement.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    svgElement.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    svgElement.addEventListener('mouseleave', (e) => this.handleMouseUp(e));

    // Touch events for mobile panning
    svgElement.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    svgElement.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    svgElement.addEventListener('touchend', (e) => this.handleTouchEnd(e));

    // Wheel event for zooming
    svgElement.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

    // Context menu event for save option
    svgElement.addEventListener('contextmenu', (e) => this.handleContextMenu(e));

    // Double-click event to re-center
    svgElement.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
  }

  handleMouseDown(e: MouseEvent) {
    if (e.button !== 0 || !this.svgDomElement) return; // Only handle left mouse button

    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragStartPanX = this.panX;
    this.dragStartPanY = this.panY;

    this.svgDomElement.setCssStyles({ cursor: 'grabbing' });
  }

  handleMouseMove(e: MouseEvent) {
    if (!this.isDragging || !this.svgDomElement) return;

    const deltaX = e.clientX - this.dragStartX;
    const deltaY = e.clientY - this.dragStartY;

    // Convert screen delta to SVG coordinate delta
    const rect = this.svgDomElement.getBoundingClientRect();
    const svgDeltaX = (deltaX / rect.width) * (this.fixedViewBoxWidth / this.zoom);
    const svgDeltaY = (deltaY / rect.height) * (this.fixedViewBoxHeight / this.zoom);

    this.panX = this.dragStartPanX - svgDeltaX;
    this.panY = this.dragStartPanY - svgDeltaY;

    this.applyPanLimits();
    this.updateViewBox();
  }

  handleMouseUp(e: MouseEvent) {
    if (!this.isDragging || !this.svgDomElement) return;

    this.isDragging = false;
    this.svgDomElement.setCssStyles({ cursor: 'grab' });
  }

  handleTouchStart(e: TouchEvent) {
    if (e.touches.length !== 1 || !this.svgDomElement) return; // Only handle single touch for now

    e.preventDefault();

    const touch = e.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchStartPanX = this.panX;
    this.touchStartPanY = this.panY;
  }

  handleTouchMove(e: TouchEvent) {
    if (e.touches.length !== 1 || !this.svgDomElement) return;

    e.preventDefault();

    const touch = e.touches[0];
    const deltaX = touch.clientX - this.touchStartX;
    const deltaY = touch.clientY - this.touchStartY;

    // Convert screen delta to SVG coordinate delta
    const rect = this.svgDomElement.getBoundingClientRect();
    const svgDeltaX = (deltaX / rect.width) * (this.fixedViewBoxWidth / this.zoom);
    const svgDeltaY = (deltaY / rect.height) * (this.fixedViewBoxHeight / this.zoom);

    this.panX = this.touchStartPanX - svgDeltaX;
    this.panY = this.touchStartPanY - svgDeltaY;

    this.applyPanLimits();
    this.updateViewBox();
  }

  handleTouchEnd(e: TouchEvent) {
    // Touch ended, nothing to do
  }

  handleWheel(e: WheelEvent) {
    e.preventDefault();

    if (!this.svgDomElement) return;

    const rect = this.svgDomElement.getBoundingClientRect();

    // Get mouse position relative to SVG
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert to SVG coordinates (before zoom)
    const svgX = (mouseX / rect.width) * (this.fixedViewBoxWidth / this.zoom) + this.getViewBoxX();
    const svgY = (mouseY / rect.height) * (this.fixedViewBoxHeight / this.zoom) + this.getViewBoxY();

    // Calculate zoom delta
    const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * zoomDelta));

    if (newZoom === this.zoom) return; // Zoom limit reached

    // Calculate new pan to keep the point under mouse cursor in the same place
    const newViewBoxWidth = this.fixedViewBoxWidth / newZoom;
    const newViewBoxHeight = this.fixedViewBoxHeight / newZoom;

    const newViewBoxX = svgX - (mouseX / rect.width) * newViewBoxWidth;
    const newViewBoxY = svgY - (mouseY / rect.height) * newViewBoxHeight;

    // Update zoom and pan
    this.zoom = newZoom;
    if (!this.parser) return;
    const initialCenter = this.parser.getInitialCenter();
    this.panX = newViewBoxX - (initialCenter.x - newViewBoxWidth / 2);
    this.panY = newViewBoxY - (initialCenter.y - newViewBoxHeight / 2);

    this.applyPanLimits();
    this.updateViewBox();
  }

  getViewBoxX(): number {
    if (!this.parser) return 0;
    const initialCenter = this.parser.getInitialCenter();
    const viewBoxWidth = this.fixedViewBoxWidth / this.zoom;
    return initialCenter.x - viewBoxWidth / 2 + this.panX;
  }

  getViewBoxY(): number {
    if (!this.parser) return 0;
    const initialCenter = this.parser.getInitialCenter();
    const viewBoxHeight = this.fixedViewBoxHeight / this.zoom;
    return initialCenter.y - viewBoxHeight / 2 + this.panY;
  }

  applyPanLimits() {
    if (!this.contentBounds || !this.parser) return;

    const viewBoxWidth = this.fixedViewBoxWidth / this.zoom;
    const viewBoxHeight = this.fixedViewBoxHeight / this.zoom;
    const initialCenter = this.parser.getInitialCenter();

    // Calculate limits based on viewBox boundaries
    // viewBoxX = initialCenter.x - viewBoxWidth/2 + panX
    // We need: viewBoxX >= contentBounds.minX and viewBoxX + viewBoxWidth <= contentBounds.maxX
    const minPanX = this.contentBounds.minX - initialCenter.x + viewBoxWidth / 2;
    const maxPanX = this.contentBounds.maxX - initialCenter.x - viewBoxWidth / 2;

    // Similar for Y
    const minPanY = this.contentBounds.minY - initialCenter.y + viewBoxHeight / 2;
    const maxPanY = this.contentBounds.maxY - initialCenter.y - viewBoxHeight / 2;

    // Apply constraints
    this.panX = Math.max(minPanX, Math.min(maxPanX, this.panX));
    this.panY = Math.max(minPanY, Math.min(maxPanY, this.panY));
  }

  updateViewBox() {
    if (!this.svgDomElement) return;

    const viewBoxX = this.getViewBoxX();
    const viewBoxY = this.getViewBoxY();
    const viewBoxWidth = this.fixedViewBoxWidth / this.zoom;
    const viewBoxHeight = this.fixedViewBoxHeight / this.zoom;

    this.svgDomElement.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`);
  }

  handleDoubleClick(e: MouseEvent) {
    // Re-center the map on double-click
    this.recenter();
  }

  recenter() {
    // Reset pan to center on the initial center point
    this.panX = 0;
    this.panY = 0;
    this.applyPanLimits();
    this.updateViewBox();
  }

  centerOnHex(x: number, y: number) {
    if (!this.parser || this.parser.isDungeonMap()) return;

    const hexPoint = this.parser.orientation.pixels(new Point(x, y));
    const initialCenter = this.parser.getInitialCenter();

    // Calculate pan to center the hex in the view
    this.panX = hexPoint.x - initialCenter.x;
    this.panY = hexPoint.y - initialCenter.y;

    this.applyPanLimits();
    this.updateViewBox();
  }

  handleContextMenu(e: MouseEvent) {
    if (!this.svgDomElement) return;

    e.preventDefault();

    const menu = new Menu();
    menu.addItem((item) => {
      item
        .setTitle('Re-center')
        .setIcon('crosshair')
        .onClick(() => {
          this.recenter();
        });
    });
    menu.addItem((item) => {
      item
        .setTitle('Save canvas as PNG')
        .setIcon('download')
        .onClick(() => {
          void this.saveSvgAsPng();
        });
    });

    // Add separator if there are overlays
    const hasOverlays = this.hasOverlays();
    if (hasOverlays) {
      menu.addSeparator();
      menu.addItem((item) => {
        item
          .setTitle(this.plugin.settings.overlaysVisible ? 'Hide overlays' : 'Show overlays')
          .setIcon(this.plugin.settings.overlaysVisible ? 'eye-off' : 'eye')
          .onClick(() => {
            this.toggleOverlays();
          });
      });
    }

    menu.showAtPosition({ x: e.clientX, y: e.clientY });
  }

  hasOverlays(): boolean {
    if (!this.svgDomElement || !this.parser) return false;

    // Find the overlays group using the namespace
    const overlaysId = this.parser.options.global ? 'overlays' : `overlays-${this.parser.id}`;
    const overlaysEl = this.svgDomElement.querySelector(`#${overlaysId}`);

    return overlaysEl !== null;
  }

  toggleOverlays() {
    if (!this.svgDomElement || !this.parser) return;

    // Toggle the setting and save it
    this.plugin.settings.overlaysVisible = !this.plugin.settings.overlaysVisible;
    void this.plugin.saveSettings();

    // Apply to all active mappers
    this.plugin.activeMappers.forEach((mapper) => {
      mapper.applyOverlayVisibility();
    });
  }

  async saveSvgAsPng() {
    if (!this.svgDomElement || !this.parser) {
      new Notice('Error: SVG element not found');
      return;
    }

    try {
      // Get the full content bounds for the PNG
      const contentBounds = this.parser.getContentBounds();
      if (!contentBounds) {
        new Notice('Error: Could not determine map bounds');
        return;
      }

      // Calculate dimensions based on content bounds
      let width = contentBounds.maxX - contentBounds.minX;
      let height = contentBounds.maxY - contentBounds.minY;

      // Validate dimensions
      if (width <= 0 || height <= 0 || !isFinite(width) || !isFinite(height)) {
        new Notice('Error: Invalid map dimensions');
        return;
      }

      // Limit maximum canvas size to prevent browser issues
      // Most browsers have limits around 16k-32k pixels, but we'll be conservative
      const MAX_DIMENSION = 16384; // 16k pixels is safer
      let scale = 1.0;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.floor(width * scale);
        height = Math.floor(height * scale);
      }

      // Ensure dimensions are integers and at least 1 pixel
      width = Math.max(1, Math.floor(width));
      height = Math.max(1, Math.floor(height));

      // Create a clone of the SVG with the full viewBox
      const svgClone = this.svgDomElement.cloneNode(true) as SVGSVGElement;
      svgClone.setAttribute(
        'viewBox',
        `${contentBounds.minX} ${contentBounds.minY} ${contentBounds.maxX - contentBounds.minX} ${contentBounds.maxY - contentBounds.minY}`,
      );
      svgClone.setAttribute('width', width.toString());
      svgClone.setAttribute('height', height.toString());

      // Serialize SVG to string
      const svgData = new XMLSerializer().serializeToString(svgClone);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);

      // Create canvas and draw SVG
      const canvas = createEl('canvas');

      // Set dimensions and validate
      canvas.width = width;
      canvas.height = height;

      // Verify canvas dimensions were set correctly
      if (canvas.width !== width || canvas.height !== height) {
        URL.revokeObjectURL(svgUrl);
        throw new Error(
          `Canvas dimensions mismatch: expected ${width}x${height}, got ${canvas.width}x${canvas.height}`,
        );
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: false });

      if (!ctx) {
        URL.revokeObjectURL(svgUrl);
        throw new Error('Could not create canvas context');
      }

      // Fill white background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, width, height);

      // Load SVG as image and draw on canvas
      const img = new Image();
      img.crossOrigin = 'anonymous'; // Prevent CORS issues

      await new Promise<void>((resolve, reject) => {
        const imgTimeout = window.setTimeout(() => {
          URL.revokeObjectURL(svgUrl);
          reject(new Error('Timeout loading SVG image'));
        }, 10000); // 10 second timeout for image loading

        img.onload = () => {
          window.clearTimeout(imgTimeout);
          try {
            ctx.drawImage(img, 0, 0, width, height);
            URL.revokeObjectURL(svgUrl);
            resolve();
          } catch (error) {
            URL.revokeObjectURL(svgUrl);
            reject(
              new Error(`Failed to draw image on canvas: ${error instanceof Error ? error.message : String(error)}`),
            );
          }
        };
        img.onerror = (error) => {
          window.clearTimeout(imgTimeout);
          URL.revokeObjectURL(svgUrl);
          reject(new Error(`Failed to load SVG image: ${typeof error === 'string' ? error : 'load error'}`));
        };
        img.src = svgUrl;
      });

      // Validate canvas before conversion
      if (canvas.width === 0 || canvas.height === 0) {
        throw new Error(`Invalid canvas dimensions: ${canvas.width}x${canvas.height}`);
      }

      // Convert canvas to blob using toDataURL (more reliable than toBlob)
      let blob: Blob;
      try {
        // Use toDataURL which is more reliable across browsers
        const dataUrl = canvas.toDataURL('image/png');
        if (!dataUrl || dataUrl === 'data:,' || dataUrl.length < 100) {
          throw new Error(`toDataURL returned invalid data (length: ${dataUrl?.length || 0})`);
        }

        // Convert data URL to blob by decoding the base64 payload directly.
        // (Obsidian discourages fetch; requestUrl does not handle data: URLs.)
        const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        blob = new Blob([bytes], { type: 'image/png' });
        if (!blob || blob.size === 0) {
          throw new Error(`Blob from data URL is empty (size: ${blob?.size || 0})`);
        }
      } catch (error) {
        // If toDataURL fails, try toBlob as fallback
        console.warn('toDataURL failed, trying toBlob fallback:', error);
        try {
          blob = await new Promise<Blob>((resolve, reject) => {
            const timeout = window.setTimeout(() => {
              reject(new Error('Timeout: Canvas conversion took too long'));
            }, 30000);

            canvas.toBlob(
              (result) => {
                window.clearTimeout(timeout);
                if (result) {
                  resolve(result);
                } else {
                  reject(new Error('toBlob returned null'));
                }
              },
              'image/png',
              1.0,
            );
          });
        } catch (fallbackError) {
          const errorMsg =
            `Failed to convert canvas (${canvas.width}x${canvas.height}) to blob. ` +
            `Primary method (toDataURL) error: ${error instanceof Error ? error.message : String(error)}. ` +
            `Fallback method (toBlob) error: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`;
          throw new Error(errorMsg);
        }
      }

      // Get current file to determine save location
      const activeFile = this.plugin.app.workspace.getActiveFile();
      let basePath = '';
      let baseName = 'crawl-map-export';

      if (activeFile) {
        const filePath = activeFile.path;
        const lastSlash = filePath.lastIndexOf('/');
        if (lastSlash >= 0) {
          basePath = filePath.substring(0, lastSlash + 1);
        }
        baseName = activeFile.basename;
      }

      // Use settings save location if configured
      let savePath = '';
      if (this.plugin.settings.saveLocation) {
        // Ensure the folder exists
        const folderPath = this.plugin.settings.saveLocation;
        const folder = this.plugin.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
          try {
            await this.plugin.app.vault.createFolder(folderPath);
          } catch (error) {
            // Folder might already exist or path might be invalid
            console.warn('Could not create folder:', error);
          }
        }
        savePath = folderPath.endsWith('/') ? folderPath : folderPath + '/';
      } else {
        // If no save location is set, save in the same folder as the current note
        savePath = basePath;
      }

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `${savePath}${baseName}-${timestamp}.png`;

      // Save file
      await this.plugin.app.vault.createBinary(filename, await blob.arrayBuffer());

      new Notice(`Canvas saved as ${filename}`);
    } catch (error) {
      console.error('Error saving SVG as PNG:', error);
      new Notice(`Error saving canvas: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
