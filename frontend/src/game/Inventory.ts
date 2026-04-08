export type ToolType = 'dig' | 'build' | 'hand';

export interface InventoryItem {
  id: string;
  name: string;
  icon: string;
  tool?: ToolType;
  count?: number;
}

export class Inventory {
  private slots: (InventoryItem | null)[];
  private activeSlot = 0;
  private readonly MAX_SLOTS = 8;

  constructor() {
    this.slots = new Array(this.MAX_SLOTS).fill(null);
    this.slots[0] = { id: 'shovel', name: 'Xẻng', icon: '⛏️', tool: 'dig' };
    this.slots[1] = { id: 'hammer', name: 'Búa', icon: '🔨', tool: 'build' };
    this.slots[2] = { id: 'hand', name: 'Tay', icon: '✋', tool: 'hand' };

    document.addEventListener('keydown', (e) => {
      const num = parseInt(e.key);
      if (num >= 1 && num <= this.MAX_SLOTS) {
        this.setActiveSlot(num - 1);
      }
    });

    document.addEventListener('wheel', (e) => {
      if (e.deltaY > 0) {
        this.setActiveSlot((this.activeSlot + 1) % this.MAX_SLOTS);
      } else {
        this.setActiveSlot((this.activeSlot - 1 + this.MAX_SLOTS) % this.MAX_SLOTS);
      }
    });
  }

  setActiveSlot(index: number) {
    this.activeSlot = Math.max(0, Math.min(this.MAX_SLOTS - 1, index));
    this.dispatchChange();
  }

  getActiveItem(): InventoryItem | null {
    return this.slots[this.activeSlot];
  }

  getActiveTool(): ToolType {
    return this.getActiveItem()?.tool ?? 'hand';
  }

  getSlots(): (InventoryItem | null)[] {
    return [...this.slots];
  }

  getActiveSlot(): number {
    return this.activeSlot;
  }

  private dispatchChange() {
    window.dispatchEvent(new CustomEvent('inventoryChange', {
      detail: { activeSlot: this.activeSlot, item: this.getActiveItem() }
    }));
  }
}
