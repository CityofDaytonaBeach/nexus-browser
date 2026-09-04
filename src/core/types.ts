import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'events';

export interface BrowserPage {
  id: string;
  url: string;
  title: string;
  content: string;
  screenshot?: Buffer;
  pdf?: Buffer;
  timestamp: number;
}

export interface BrowserAction {
  type: 'navigate' | 'click' | 'type' | 'scroll' | 'screenshot' | 'evaluate' | 'pdf' | 'wait' | 'back' | 'forward' | 'reload' | 'select' | 'hover' | 'press' | 'drag';
  selector?: string;
  value?: string;
  url?: string;
  script?: string;
  options?: Record<string, any>;
  coordinates?: { x: number; y: number };
}

export interface ActionResult {
  success: boolean;
  data?: any;
  error?: string;
  page?: BrowserPage;
  duration: number;
}

export interface PageInfo {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  loading: boolean;
}

export interface SessionInfo {
  id: string;
  createdAt: number;
  lastActive: number;
  pages: PageInfo[];
  activePageId?: string;
}
