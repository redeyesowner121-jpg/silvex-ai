export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      customer_alerts: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          msg: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          msg: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          msg?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_alerts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          api_enabled: boolean
          api_key: string | null
          auth_user_id: string | null
          email: string | null
          extra: Json
          id: string
          joined_at: string
          legacy_uid: string | null
          name: string
          phone: string | null
          ref_bonus_done: boolean
          ref_by: string | null
          ref_code: string | null
          ref_earned: number
          source: string | null
          telegram_chat_id: number | null
          telegram_username: string | null
          total_deposit: number
          updated_at: string
          used_coupons: Json
          used_ref: string | null
          wallet: number
        }
        Insert: {
          api_enabled?: boolean
          api_key?: string | null
          auth_user_id?: string | null
          email?: string | null
          extra?: Json
          id?: string
          joined_at?: string
          legacy_uid?: string | null
          name?: string
          phone?: string | null
          ref_bonus_done?: boolean
          ref_by?: string | null
          ref_code?: string | null
          ref_earned?: number
          source?: string | null
          telegram_chat_id?: number | null
          telegram_username?: string | null
          total_deposit?: number
          updated_at?: string
          used_coupons?: Json
          used_ref?: string | null
          wallet?: number
        }
        Update: {
          api_enabled?: boolean
          api_key?: string | null
          auth_user_id?: string | null
          email?: string | null
          extra?: Json
          id?: string
          joined_at?: string
          legacy_uid?: string | null
          name?: string
          phone?: string | null
          ref_bonus_done?: boolean
          ref_by?: string | null
          ref_code?: string | null
          ref_earned?: number
          source?: string | null
          telegram_chat_id?: number | null
          telegram_username?: string | null
          total_deposit?: number
          updated_at?: string
          used_coupons?: Json
          used_ref?: string | null
          wallet?: number
        }
        Relationships: []
      }
      kv_store: {
        Row: {
          path: string
          updated_at: string
          value: Json | null
        }
        Insert: {
          path: string
          updated_at?: string
          value?: Json | null
        }
        Update: {
          path?: string
          updated_at?: string
          value?: Json | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          msg: string
        }
        Insert: {
          created_at?: string
          id?: string
          msg: string
        }
        Update: {
          created_at?: string
          id?: string
          msg?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          coupon: string | null
          coupon_discount: number
          created_at: string
          customer_id: string | null
          delivery: Json | null
          email: string | null
          extra: Json
          id: string
          items: Json
          note: string | null
          source: string | null
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          coupon?: string | null
          coupon_discount?: number
          created_at?: string
          customer_id?: string | null
          delivery?: Json | null
          email?: string | null
          extra?: Json
          id: string
          items?: Json
          note?: string | null
          source?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          coupon?: string | null
          coupon_discount?: number
          created_at?: string
          customer_id?: string | null
          delivery?: Json | null
          email?: string | null
          extra?: Json
          id?: string
          items?: Json
          note?: string | null
          source?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_usd: number | null
          created_at: string
          customer_id: string | null
          data: Json
          id: string
          kind: string
          status: string | null
        }
        Insert: {
          amount_usd?: number | null
          created_at?: string
          customer_id?: string | null
          data?: Json
          id: string
          kind: string
          status?: string | null
        }
        Update: {
          amount_usd?: number | null
          created_at?: string
          customer_id?: string | null
          data?: Json
          id?: string
          kind?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_stock: {
        Row: {
          content: string
          created_at: string
          id: number
          product_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: number
          product_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          api_price: number | null
          bot_price: number | null
          created_at: string
          delivery: string
          description: string | null
          extra: Json
          hidden: boolean
          hide_bot: boolean
          hide_web: boolean
          id: string
          link: string | null
          locked: boolean
          logo: string | null
          markup: number | null
          price: number
          provider: string | null
          provider_name: string | null
          sales_count: number
          sold_out: boolean
          stock_count: number
          supplier_id: string | null
          supplier_price: number | null
          supplier_stock: number | null
          supplier_synced_at: string | null
          title: string
          type: string | null
          updated_at: string
        }
        Insert: {
          api_price?: number | null
          bot_price?: number | null
          created_at?: string
          delivery?: string
          description?: string | null
          extra?: Json
          hidden?: boolean
          hide_bot?: boolean
          hide_web?: boolean
          id: string
          link?: string | null
          locked?: boolean
          logo?: string | null
          markup?: number | null
          price?: number
          provider?: string | null
          provider_name?: string | null
          sales_count?: number
          sold_out?: boolean
          stock_count?: number
          supplier_id?: string | null
          supplier_price?: number | null
          supplier_stock?: number | null
          supplier_synced_at?: string | null
          title?: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          api_price?: number | null
          bot_price?: number | null
          created_at?: string
          delivery?: string
          description?: string | null
          extra?: Json
          hidden?: boolean
          hide_bot?: boolean
          hide_web?: boolean
          id?: string
          link?: string | null
          locked?: boolean
          logo?: string | null
          markup?: number | null
          price?: number
          provider?: string | null
          provider_name?: string | null
          sales_count?: number
          sold_out?: boolean
          stock_count?: number
          supplier_id?: string | null
          supplier_price?: number | null
          supplier_stock?: number | null
          supplier_synced_at?: string | null
          title?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string
          customer_id: string | null
          data: Json
          id: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          data: Json
          id: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          data?: Json
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          amount: number | null
          created_at: string
          customer_id: string | null
          data: Json
          id: string
          kind: string | null
          legacy_id: string | null
          status: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          customer_id?: string | null
          data?: Json
          id?: string
          kind?: string | null
          legacy_id?: string | null
          status?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          customer_id?: string | null
          data?: Json
          id?: string
          kind?: string | null
          legacy_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string | null
          created_at: string
          customer_id: string | null
          id: string
          name: string | null
          product_id: string | null
          rating: number
        }
        Insert: {
          body?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          name?: string | null
          product_id?: string | null
          rating?: number
        }
        Update: {
          body?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          name?: string | null
          product_id?: string | null
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          is_public: boolean
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          is_public?: boolean
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          is_public?: boolean
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      used_stock: {
        Row: {
          content: string
          created_at: string
          email: string | null
          id: string
          order_id: string | null
          product_id: string
        }
        Insert: {
          content: string
          created_at?: string
          email?: string | null
          id?: string
          order_id?: string | null
          product_id: string
        }
        Update: {
          content?: string
          created_at?: string
          email?: string | null
          id?: string
          order_id?: string | null
          product_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_history: {
        Row: {
          amount: number
          by_email: string | null
          created_at: string
          customer_id: string
          description: string | null
          extra: Json
          id: string
          legacy_id: string | null
          type: string
        }
        Insert: {
          amount?: number
          by_email?: string | null
          created_at?: string
          customer_id: string
          description?: string | null
          extra?: Json
          id?: string
          legacy_id?: string | null
          type?: string
        }
        Update: {
          amount?: number
          by_email?: string | null
          created_at?: string
          customer_id?: string
          description?: string | null
          extra?: Json
          id?: string
          legacy_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_payment: {
        Args: {
          _customer: string
          _data: Json
          _id: string
          _kind: string
          _usd: number
        }
        Returns: boolean
      }
      claim_stock: {
        Args: { _email: string; _order: string; _product: string; _qty: number }
        Returns: string[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      update_my_profile: {
        Args: { _name: string; _phone: string }
        Returns: undefined
      }
      wallet_adjust: {
        Args: {
          _by?: string
          _customer: string
          _delta: number
          _desc: string
          _extra?: Json
          _type: string
        }
        Returns: number
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "admin", "user"],
    },
  },
} as const
