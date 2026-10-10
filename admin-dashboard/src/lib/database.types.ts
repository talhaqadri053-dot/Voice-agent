export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'completed'
  | 'cancelled';
export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type Database = {
  public: {
    Tables: {
      menu_items: {
        Row: { id: string; name: string; description: string; price: number; category: string; available: boolean; prep_minutes: number; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; description?: string; price: number; category: string; available?: boolean; prep_minutes?: number; created_at?: string; updated_at?: string };
        Update: { id?: string; name?: string; description?: string; price?: number; category?: string; available?: boolean; prep_minutes?: number; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      menu_modifier_groups: {
        Row: { id: string; name: string; required: boolean; min_select: number; max_select: number; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; required?: boolean; min_select?: number; max_select?: number; created_at?: string; updated_at?: string };
        Update: { id?: string; name?: string; required?: boolean; min_select?: number; max_select?: number; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      menu_modifier_options: {
        Row: { id: string; group_id: string; name: string; extra_price: number; created_at: string; updated_at: string };
        Insert: { id?: string; group_id: string; name: string; extra_price?: number; created_at?: string; updated_at?: string };
        Update: { id?: string; group_id?: string; name?: string; extra_price?: number; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      menu_item_modifier_groups: {
        Row: { id: string; menu_item_id: string; modifier_group_id: string; created_at: string; updated_at: string };
        Insert: { id?: string; menu_item_id: string; modifier_group_id: string; created_at?: string; updated_at?: string };
        Update: { id?: string; menu_item_id?: string; modifier_group_id?: string; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      delivery_zones: {
        Row: { id: string; name: string; postcodes: string[]; fee: number; minimum_order: number; active: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; postcodes?: string[]; fee?: number; minimum_order?: number; active?: boolean; created_at?: string; updated_at?: string };
        Update: { id?: string; name?: string; postcodes?: string[]; fee?: number; minimum_order?: number; active?: boolean; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      promotions: {
        Row: { id: string; name: string; promo_type: 'percentage' | 'flat_amount' | 'free_item'; discount_value: number | null; free_item: string | null; promo_code: string | null; minimum_order: number; starts_at: string; ends_at: string; days_of_week: number[]; is_active: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; promo_type: 'percentage' | 'flat_amount' | 'free_item'; discount_value?: number | null; free_item?: string | null; promo_code?: string | null; minimum_order?: number; starts_at: string; ends_at: string; days_of_week?: number[]; is_active?: boolean; created_at?: string; updated_at?: string };
        Update: { id?: string; name?: string; promo_type?: 'percentage' | 'flat_amount' | 'free_item'; discount_value?: number | null; free_item?: string | null; promo_code?: string | null; minimum_order?: number; starts_at?: string; ends_at?: string; days_of_week?: number[]; is_active?: boolean; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      orders: {
        Row: { id: string; customer_phone: string; order_type: 'pickup' | 'delivery'; delivery_address: string | null; subtotal: number; discount_amount: number; total: number; delivery_fee: number; status: OrderStatus; eta_minutes: number | null; call_id: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; customer_phone: string; order_type: 'pickup' | 'delivery'; delivery_address?: string | null; subtotal?: number; discount_amount?: number; total?: number; delivery_fee?: number; status?: OrderStatus; eta_minutes?: number | null; call_id?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; customer_phone?: string; order_type?: 'pickup' | 'delivery'; delivery_address?: string | null; subtotal?: number; discount_amount?: number; total?: number; delivery_fee?: number; status?: OrderStatus; eta_minutes?: number | null; call_id?: string | null; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      order_items: {
        Row: { id: string; order_id: string; menu_item_id: string | null; item_name: string; quantity: number; unit_price: number; notes: string; created_at: string; updated_at: string };
        Insert: { id?: string; order_id: string; menu_item_id?: string | null; item_name: string; quantity: number; unit_price: number; notes?: string; created_at?: string; updated_at?: string };
        Update: { id?: string; order_id?: string; menu_item_id?: string | null; item_name?: string; quantity?: number; unit_price?: number; notes?: string; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      bookings: {
        Row: { id: string; call_id: string | null; customer_phone: string; customer_name: string; service: string; date: string; time: string; people_count: number; status: BookingStatus; created_at: string; updated_at: string };
        Insert: { id?: string; call_id?: string | null; customer_phone: string; customer_name: string; service: string; date: string; time: string; people_count?: number; status?: BookingStatus; created_at?: string; updated_at?: string };
        Update: { id?: string; call_id?: string | null; customer_phone?: string; customer_name?: string; service?: string; date?: string; time?: string; people_count?: number; status?: BookingStatus; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      calls: {
        Row: { id: string; vapi_call_id: string | null; phone: string | null; transcript: string; transcript_messages: Json; recording_url: string | null; turn_metrics: Json; summary: string; duration_seconds: number | null; sms_status: string; created_at: string; updated_at: string };
        Insert: { id?: string; vapi_call_id?: string | null; phone?: string | null; transcript?: string; transcript_messages?: Json; recording_url?: string | null; turn_metrics?: Json; summary?: string; duration_seconds?: number | null; sms_status?: string; created_at?: string; updated_at?: string };
        Update: { id?: string; vapi_call_id?: string | null; phone?: string | null; transcript?: string; transcript_messages?: Json; recording_url?: string | null; turn_metrics?: Json; summary?: string; duration_seconds?: number | null; sms_status?: string; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      settings: {
        Row: { key: string; value: Json; created_at: string; updated_at: string };
        Insert: { key: string; value: Json; created_at?: string; updated_at?: string };
        Update: { key?: string; value?: Json; created_at?: string; updated_at?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      voice_get_menu_prompt_context: { Args: Record<PropertyKey, never>; Returns: Json };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

