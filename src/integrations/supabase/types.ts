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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          business_id: string
          created_at: string
          description: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          metadata: Json
          user_email: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          business_id: string
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          business_id?: string
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_number: string | null
          account_type: string
          balance: number
          bank_name: string | null
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          account_type?: string
          balance?: number
          bank_name?: string | null
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          account_type?: string
          balance?: number
          bank_name?: string | null
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          bank_account_id: string
          business_id: string
          category: string | null
          contact_name: string | null
          created_at: string
          created_by: string
          date: string
          description: string | null
          expense_id: string | null
          id: string
          purchase_id: string | null
          reference: string | null
          sale_id: string | null
          supplier_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          amount?: number
          bank_account_id: string
          business_id: string
          category?: string | null
          contact_name?: string | null
          created_at?: string
          created_by: string
          date?: string
          description?: string | null
          expense_id?: string | null
          id?: string
          purchase_id?: string | null
          reference?: string | null
          sale_id?: string | null
          supplier_id?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          business_id?: string
          category?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string
          date?: string
          description?: string | null
          expense_id?: string | null
          id?: string
          purchase_id?: string | null
          reference?: string | null
          sale_id?: string | null
          supplier_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          business_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_payment_credentials: {
        Row: {
          business_id: string
          created_at: string
          has_credentials: boolean
          id: string
          provider: string
          updated_at: string
          vault_secret_names: Json
        }
        Insert: {
          business_id: string
          created_at?: string
          has_credentials?: boolean
          id?: string
          provider: string
          updated_at?: string
          vault_secret_names?: Json
        }
        Update: {
          business_id?: string
          created_at?: string
          has_credentials?: boolean
          id?: string
          provider?: string
          updated_at?: string
          vault_secret_names?: Json
        }
        Relationships: []
      }
      businesses: {
        Row: {
          accountant_email: string | null
          accountant_name: string | null
          accountant_phone: string | null
          address: string | null
          business_type: string
          created_at: string
          currency: string
          email: string | null
          id: string
          is_active: boolean
          kra_pin: string | null
          logo_url: string | null
          mpesa_account_reference: string | null
          mpesa_callback_url: string | null
          mpesa_enabled: boolean
          mpesa_environment: string
          mpesa_paybill_or_till: string
          mpesa_shortcode: string | null
          name: string
          owner_id: string | null
          phone: string | null
          pos_manager_approver_id: string | null
          pos_require_manager_to_remove_item: boolean
          pos_show_stock_qty: boolean
          prevent_overselling: boolean
          status: string
          tax_rate: number | null
          theme_color: string
          timezone: string
          track_batches: boolean
          updated_at: string
          vat_enabled: boolean
          zoho_reports_enabled: boolean
        }
        Insert: {
          accountant_email?: string | null
          accountant_name?: string | null
          accountant_phone?: string | null
          address?: string | null
          business_type?: string
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          is_active?: boolean
          kra_pin?: string | null
          logo_url?: string | null
          mpesa_account_reference?: string | null
          mpesa_callback_url?: string | null
          mpesa_enabled?: boolean
          mpesa_environment?: string
          mpesa_paybill_or_till?: string
          mpesa_shortcode?: string | null
          name: string
          owner_id?: string | null
          phone?: string | null
          pos_manager_approver_id?: string | null
          pos_require_manager_to_remove_item?: boolean
          pos_show_stock_qty?: boolean
          prevent_overselling?: boolean
          status?: string
          tax_rate?: number | null
          theme_color?: string
          timezone?: string
          track_batches?: boolean
          updated_at?: string
          vat_enabled?: boolean
          zoho_reports_enabled?: boolean
        }
        Update: {
          accountant_email?: string | null
          accountant_name?: string | null
          accountant_phone?: string | null
          address?: string | null
          business_type?: string
          created_at?: string
          currency?: string
          email?: string | null
          id?: string
          is_active?: boolean
          kra_pin?: string | null
          logo_url?: string | null
          mpesa_account_reference?: string | null
          mpesa_callback_url?: string | null
          mpesa_enabled?: boolean
          mpesa_environment?: string
          mpesa_paybill_or_till?: string
          mpesa_shortcode?: string | null
          name?: string
          owner_id?: string | null
          phone?: string | null
          pos_manager_approver_id?: string | null
          pos_require_manager_to_remove_item?: boolean
          pos_show_stock_qty?: boolean
          prevent_overselling?: boolean
          status?: string
          tax_rate?: number | null
          theme_color?: string
          timezone?: string
          track_batches?: boolean
          updated_at?: string
          vat_enabled?: boolean
          zoho_reports_enabled?: boolean
        }
        Relationships: []
      }
      categories: {
        Row: {
          business_id: string
          created_at: string
          id: string
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          business_id: string
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          opening_balance: number
          opening_balance_date: string | null
          parent_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          business_id: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          opening_balance?: number
          opening_balance_date?: string | null
          parent_id?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          opening_balance?: number
          opening_balance_date?: string | null
          parent_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          balance: number
          business_id: string
          created_at: string
          customer_type: string | null
          email: string | null
          id: string
          kra_pin: string | null
          name: string
          phone: string | null
          tax_exemption_number: string | null
          updated_at: string
          vat_registered: boolean | null
        }
        Insert: {
          address?: string | null
          balance?: number
          business_id: string
          created_at?: string
          customer_type?: string | null
          email?: string | null
          id?: string
          kra_pin?: string | null
          name: string
          phone?: string | null
          tax_exemption_number?: string | null
          updated_at?: string
          vat_registered?: boolean | null
        }
        Update: {
          address?: string | null
          balance?: number
          business_id?: string
          created_at?: string
          customer_type?: string | null
          email?: string | null
          id?: string
          kra_pin?: string | null
          name?: string
          phone?: string | null
          tax_exemption_number?: string | null
          updated_at?: string
          vat_registered?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      digitax_invoice_queue: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          invoice_type: Database["public"]["Enums"]["digitax_invoice_type"]
          next_retry_at: string
          original_sale_id: string | null
          payload_json: Json
          response_json: Json | null
          retry_count: number
          sale_id: string | null
          status: Database["public"]["Enums"]["digitax_queue_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          invoice_type?: Database["public"]["Enums"]["digitax_invoice_type"]
          next_retry_at?: string
          original_sale_id?: string | null
          payload_json: Json
          response_json?: Json | null
          retry_count?: number
          sale_id?: string | null
          status?: Database["public"]["Enums"]["digitax_queue_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          invoice_type?: Database["public"]["Enums"]["digitax_invoice_type"]
          next_retry_at?: string
          original_sale_id?: string | null
          payload_json?: Json
          response_json?: Json | null
          retry_count?: number
          sale_id?: string | null
          status?: Database["public"]["Enums"]["digitax_queue_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "digitax_invoice_queue_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digitax_invoice_queue_original_sale_id_fkey"
            columns: ["original_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digitax_invoice_queue_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      digitax_logs: {
        Row: {
          business_id: string
          created_at: string
          endpoint: string
          execution_time_ms: number | null
          http_status: number | null
          id: string
          queue_id: string | null
          request_json: Json | null
          response_json: Json | null
          sale_id: string | null
          user_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          endpoint: string
          execution_time_ms?: number | null
          http_status?: number | null
          id?: string
          queue_id?: string | null
          request_json?: Json | null
          response_json?: Json | null
          sale_id?: string | null
          user_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          endpoint?: string
          execution_time_ms?: number | null
          http_status?: number | null
          id?: string
          queue_id?: string | null
          request_json?: Json | null
          response_json?: Json | null
          sale_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "digitax_logs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digitax_logs_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "digitax_invoice_queue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digitax_logs_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      digitax_settings: {
        Row: {
          api_key_last4: string | null
          api_key_vault_id: string | null
          branch_code: string | null
          business_id: string
          business_pin: string | null
          connection_status: Database["public"]["Enums"]["digitax_connection_status"]
          created_at: string
          default_currency: string
          default_invoice_type: Database["public"]["Enums"]["digitax_invoice_type"]
          device_name: string | null
          enabled: boolean
          environment: Database["public"]["Enums"]["digitax_environment"]
          id: string
          last_error: string | null
          last_sync_at: string | null
          max_retry_attempts: number
          mock_failure_rate: number
          provider: string
          updated_at: string
        }
        Insert: {
          api_key_last4?: string | null
          api_key_vault_id?: string | null
          branch_code?: string | null
          business_id: string
          business_pin?: string | null
          connection_status?: Database["public"]["Enums"]["digitax_connection_status"]
          created_at?: string
          default_currency?: string
          default_invoice_type?: Database["public"]["Enums"]["digitax_invoice_type"]
          device_name?: string | null
          enabled?: boolean
          environment?: Database["public"]["Enums"]["digitax_environment"]
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          max_retry_attempts?: number
          mock_failure_rate?: number
          provider?: string
          updated_at?: string
        }
        Update: {
          api_key_last4?: string | null
          api_key_vault_id?: string | null
          branch_code?: string | null
          business_id?: string
          business_pin?: string | null
          connection_status?: Database["public"]["Enums"]["digitax_connection_status"]
          created_at?: string
          default_currency?: string
          default_invoice_type?: Database["public"]["Enums"]["digitax_invoice_type"]
          device_name?: string | null
          enabled?: boolean
          environment?: Database["public"]["Enums"]["digitax_environment"]
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          max_retry_attempts?: number
          mock_failure_rate?: number
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "digitax_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          business_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          business_id: string
          category_id: string | null
          created_at: string
          created_by: string
          date: string
          description: string | null
          id: string
          location_id: string | null
          payment_method: string | null
          reference: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          business_id: string
          category_id?: string | null
          created_at?: string
          created_by: string
          date?: string
          description?: string | null
          id?: string
          location_id?: string | null
          payment_method?: string | null
          reference?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string
          category_id?: string | null
          created_at?: string
          created_by?: string
          date?: string
          description?: string | null
          id?: string
          location_id?: string | null
          payment_method?: string | null
          reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          id: string
          location_id: string
          low_stock_threshold: number
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          id?: string
          location_id: string
          low_stock_threshold?: number
          product_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          id?: string
          location_id?: string
          low_stock_threshold?: number
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          business_id: string
          created_at: string
          created_by: string
          date: string
          description: string | null
          entry_number: string | null
          id: string
          reference: string | null
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by: string
          date?: string
          description?: string | null
          entry_number?: string | null
          id?: string
          reference?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string
          date?: string
          description?: string | null
          entry_number?: string | null
          id?: string
          reference?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      journal_entry_lines: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          debit: number
          description: string | null
          id: string
          journal_entry_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_content: {
        Row: {
          content: Json | null
          created_at: string
          id: string
          is_visible: boolean
          section_key: string
          sort_order: number
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          content?: Json | null
          created_at?: string
          id?: string
          is_visible?: boolean
          section_key: string
          sort_order?: number
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          content?: Json | null
          created_at?: string
          id?: string
          is_visible?: boolean
          section_key?: string
          sort_order?: number
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          address: string | null
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          pos_require_manager_to_remove_item: boolean | null
          type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          pos_require_manager_to_remove_item?: boolean | null
          type?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          pos_require_manager_to_remove_item?: boolean | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      mpesa_transactions: {
        Row: {
          amount: number
          business_id: string
          checkout_request_id: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          id: string
          merchant_request_id: string | null
          mpesa_receipt_number: string | null
          originator_conversation_id: string | null
          phone_number: string
          result_code: number | null
          result_description: string | null
          sale_id: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          business_id: string
          checkout_request_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          merchant_request_id?: string | null
          mpesa_receipt_number?: string | null
          originator_conversation_id?: string | null
          phone_number: string
          result_code?: number | null
          result_description?: string | null
          sale_id?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string
          checkout_request_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          merchant_request_id?: string | null
          mpesa_receipt_number?: string | null
          originator_conversation_id?: string | null
          phone_number?: string
          result_code?: number | null
          result_description?: string | null
          sale_id?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mpesa_transactions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          business_id: string | null
          created_at: string
          id: string
          link: string | null
          message: string | null
          metadata: Json
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          business_id?: string | null
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          metadata?: Json
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          business_id?: string | null
          created_at?: string
          id?: string
          link?: string | null
          message?: string | null
          metadata?: Json
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      offline_payment_requests: {
        Row: {
          amount_kes: number
          billing_interval: string
          business_id: string
          created_at: string
          id: string
          method: string
          notes: string | null
          package_id: string
          reference: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_by: string
          updated_at: string
        }
        Insert: {
          amount_kes: number
          billing_interval: string
          business_id: string
          created_at?: string
          id?: string
          method: string
          notes?: string | null
          package_id: string
          reference?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by: string
          updated_at?: string
        }
        Update: {
          amount_kes?: number
          billing_interval?: string
          business_id?: string
          created_at?: string
          id?: string
          method?: string
          notes?: string | null
          package_id?: string
          reference?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offline_payment_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offline_payment_requests_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "subscription_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offline_payment_requests_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "subscription_packages_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      package_features: {
        Row: {
          created_at: string
          enabled: boolean
          feature_key: string
          feature_label: string
          id: string
          package_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature_key: string
          feature_label: string
          id?: string
          package_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature_key?: string
          feature_label?: string
          id?: string
          package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_features_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "subscription_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_features_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "subscription_packages_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_method_accounts: {
        Row: {
          bank_account_id: string | null
          business_id: string
          created_at: string
          id: string
          payment_method: string
          updated_at: string
        }
        Insert: {
          bank_account_id?: string | null
          business_id: string
          created_at?: string
          id?: string
          payment_method: string
          updated_at?: string
        }
        Update: {
          bank_account_id?: string | null
          business_id?: string
          created_at?: string
          id?: string
          payment_method?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_method_accounts_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_method_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          reference: string | null
          sale_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          reference?: string | null
          sale_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          reference?: string | null
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sessions: {
        Row: {
          business_id: string
          cash_account_id: string | null
          cash_difference: number | null
          closed_at: string | null
          closed_by: string | null
          closing_cash: number | null
          created_at: string
          expected_cash: number | null
          id: string
          location_id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_float: number
          payments_card: number
          payments_cash: number
          payments_mpesa: number
          payments_other: number
          status: string
          total_refunds: number
          total_sales: number
          total_transactions: number
          updated_at: string
        }
        Insert: {
          business_id: string
          cash_account_id?: string | null
          cash_difference?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          location_id: string
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_float?: number
          payments_card?: number
          payments_cash?: number
          payments_mpesa?: number
          payments_other?: number
          status?: string
          total_refunds?: number
          total_sales?: number
          total_transactions?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          cash_account_id?: string | null
          cash_difference?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          location_id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_float?: number
          payments_card?: number
          payments_cash?: number
          payments_mpesa?: number
          payments_other?: number
          status?: string
          total_refunds?: number
          total_sales?: number
          total_transactions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sessions_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_batches: {
        Row: {
          batch_number: string
          business_id: string
          created_at: string
          expiry_date: string | null
          id: string
          is_active: boolean
          location_id: string
          manufacture_date: string | null
          notes: string | null
          product_id: string
          quantity: number
          supplier_id: string | null
          unit_cost: number
          updated_at: string
        }
        Insert: {
          batch_number: string
          business_id: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          is_active?: boolean
          location_id: string
          manufacture_date?: string | null
          notes?: string | null
          product_id: string
          quantity?: number
          supplier_id?: string | null
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          batch_number?: string
          business_id?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          is_active?: boolean
          location_id?: string
          manufacture_date?: string | null
          notes?: string | null
          product_id?: string
          quantity?: number
          supplier_id?: string | null
          unit_cost?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          barcode: string | null
          business_id: string
          color: string | null
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          product_id: string
          purchase_price: number
          selling_price: number
          size: string | null
          sku: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          business_id: string
          color?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          product_id: string
          purchase_price?: number
          selling_price?: number
          size?: string | null
          sku?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          business_id?: string
          color?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          product_id?: string
          purchase_price?: number
          selling_price?: number
          size?: string | null
          sku?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          allow_decimal_quantity: boolean
          barcode: string | null
          brand_id: string | null
          business_id: string
          category_id: string | null
          country_of_origin: string | null
          created_at: string
          hs_code: string | null
          id: string
          image_url: string | null
          is_active: boolean
          item_classification: string | null
          kra_item_code: string | null
          name: string
          packaging_unit: string | null
          purchase_price: number
          quantity_unit: string | null
          selling_price: number
          sku: string | null
          tax_category: string | null
          tax_rate: number | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          allow_decimal_quantity?: boolean
          barcode?: string | null
          brand_id?: string | null
          business_id: string
          category_id?: string | null
          country_of_origin?: string | null
          created_at?: string
          hs_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          item_classification?: string | null
          kra_item_code?: string | null
          name: string
          packaging_unit?: string | null
          purchase_price?: number
          quantity_unit?: string | null
          selling_price?: number
          sku?: string | null
          tax_category?: string | null
          tax_rate?: number | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          allow_decimal_quantity?: boolean
          barcode?: string | null
          brand_id?: string | null
          business_id?: string
          category_id?: string | null
          country_of_origin?: string | null
          created_at?: string
          hs_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          item_classification?: string | null
          kra_item_code?: string | null
          name?: string
          packaging_unit?: string | null
          purchase_price?: number
          quantity_unit?: string | null
          selling_price?: number
          sku?: string | null
          tax_category?: string | null
          tax_rate?: number | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          assigned_location_id: string | null
          avatar_url: string | null
          business_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          assigned_location_id?: string | null
          avatar_url?: string | null
          business_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          assigned_location_id?: string | null
          avatar_url?: string | null
          business_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          batch_id: string | null
          created_at: string
          id: string
          product_id: string
          purchase_id: string
          quantity: number
          total: number
          unit_cost: number
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          id?: string
          product_id: string
          purchase_id: string
          quantity?: number
          total?: number
          unit_cost?: number
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          id?: string
          product_id?: string
          purchase_id?: string
          quantity?: number
          total?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          business_id: string
          created_at: string
          created_by: string
          id: string
          invoice_number: string | null
          location_id: string
          notes: string | null
          payment_status: string
          status: string
          subtotal: number
          supplier_id: string | null
          tax: number
          total: number
          updated_at: string
          vat_enabled: boolean
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by: string
          id?: string
          invoice_number?: string | null
          location_id: string
          notes?: string | null
          payment_status?: string
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax?: number
          total?: number
          updated_at?: string
          vat_enabled?: boolean
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string
          id?: string
          invoice_number?: string | null
          location_id?: string
          notes?: string | null
          payment_status?: string
          status?: string
          subtotal?: number
          supplier_id?: string | null
          tax?: number
          total?: number
          updated_at?: string
          vat_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "purchases_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          business_id: string
          created_at: string
          id: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          permission?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          batch_id: string | null
          created_at: string
          discount: number
          id: string
          product_id: string
          quantity: number
          sale_id: string
          total: number
          unit_price: number
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          discount?: number
          id?: string
          product_id: string
          quantity?: number
          sale_id: string
          total?: number
          unit_price?: number
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          discount?: number
          id?: string
          product_id?: string
          quantity?: number
          sale_id?: string
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          business_id: string
          created_at: string
          created_by: string
          customer_id: string | null
          discount: number
          fiscal_invoice_number: string | null
          fiscal_qr_code: string | null
          fiscal_reference: string | null
          fiscal_signature: string | null
          fiscal_status: Database["public"]["Enums"]["fiscal_status"] | null
          fiscal_submitted_at: string | null
          fiscal_verification_url: string | null
          id: string
          invoice_number: string | null
          location_id: string
          notes: string | null
          original_sale_id: string | null
          payment_status: string
          status: string
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by: string
          customer_id?: string | null
          discount?: number
          fiscal_invoice_number?: string | null
          fiscal_qr_code?: string | null
          fiscal_reference?: string | null
          fiscal_signature?: string | null
          fiscal_status?: Database["public"]["Enums"]["fiscal_status"] | null
          fiscal_submitted_at?: string | null
          fiscal_verification_url?: string | null
          id?: string
          invoice_number?: string | null
          location_id: string
          notes?: string | null
          original_sale_id?: string | null
          payment_status?: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string
          customer_id?: string | null
          discount?: number
          fiscal_invoice_number?: string | null
          fiscal_qr_code?: string | null
          fiscal_reference?: string | null
          fiscal_signature?: string | null
          fiscal_status?: Database["public"]["Enums"]["fiscal_status"] | null
          fiscal_submitted_at?: string | null
          fiscal_verification_url?: string | null
          id?: string
          invoice_number?: string | null
          location_id?: string
          notes?: string | null
          original_sale_id?: string | null
          payment_status?: string
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_original_sale_id_fkey"
            columns: ["original_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          created_at: string
          created_by: string
          id: string
          location_id: string
          notes: string | null
          product_id: string
          purchase_id: string | null
          quantity_change: number
          reason: string
          sale_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          location_id: string
          notes?: string | null
          product_id: string
          purchase_id?: string | null
          quantity_change: number
          reason: string
          sale_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          location_id?: string
          notes?: string | null
          product_id?: string
          purchase_id?: string | null
          quantity_change?: number
          reason?: string
          sale_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_packages: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_public: boolean
          max_customers: number
          max_locations: number
          max_products: number
          max_suppliers: number
          max_users: number
          monthly_price: number
          monthly_price_kes: number
          name: string
          paystack_plan_code_monthly: string | null
          paystack_plan_code_yearly: string | null
          pesapal_plan_code_monthly: string | null
          pesapal_plan_code_yearly: string | null
          sort_order: number
          trial_days: number
          updated_at: string
          yearly_price: number
          yearly_price_kes: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          max_customers?: number
          max_locations?: number
          max_products?: number
          max_suppliers?: number
          max_users?: number
          monthly_price?: number
          monthly_price_kes?: number
          name: string
          paystack_plan_code_monthly?: string | null
          paystack_plan_code_yearly?: string | null
          pesapal_plan_code_monthly?: string | null
          pesapal_plan_code_yearly?: string | null
          sort_order?: number
          trial_days?: number
          updated_at?: string
          yearly_price?: number
          yearly_price_kes?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          max_customers?: number
          max_locations?: number
          max_products?: number
          max_suppliers?: number
          max_users?: number
          monthly_price?: number
          monthly_price_kes?: number
          name?: string
          paystack_plan_code_monthly?: string | null
          paystack_plan_code_yearly?: string | null
          pesapal_plan_code_monthly?: string | null
          pesapal_plan_code_yearly?: string | null
          sort_order?: number
          trial_days?: number
          updated_at?: string
          yearly_price?: number
          yearly_price_kes?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          payment_provider: string
          paystack_customer_code: string | null
          paystack_email_token: string | null
          paystack_subscription_code: string | null
          pesapal_merchant_reference: string | null
          pesapal_order_tracking_id: string | null
          pesapal_subscription_token: string | null
          plan_code: string | null
          price_id: string | null
          product_id: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          payment_provider?: string
          paystack_customer_code?: string | null
          paystack_email_token?: string | null
          paystack_subscription_code?: string | null
          pesapal_merchant_reference?: string | null
          pesapal_order_tracking_id?: string | null
          pesapal_subscription_token?: string | null
          plan_code?: string | null
          price_id?: string | null
          product_id?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          payment_provider?: string
          paystack_customer_code?: string | null
          paystack_email_token?: string | null
          paystack_subscription_code?: string | null
          pesapal_merchant_reference?: string | null
          pesapal_order_tracking_id?: string | null
          pesapal_subscription_token?: string | null
          plan_code?: string | null
          price_id?: string | null
          product_id?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      super_admins: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          balance: number
          business_id: string
          created_at: string
          email: string | null
          id: string
          kra_pin: string | null
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          balance?: number
          business_id: string
          created_at?: string
          email?: string | null
          id?: string
          kra_pin?: string | null
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          balance?: number
          business_id?: string
          created_at?: string
          email?: string | null
          id?: string
          kra_pin?: string | null
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      suspended_sales: {
        Row: {
          business_id: string
          cart: Json
          created_at: string
          created_by: string
          customer_id: string | null
          customer_name: string | null
          id: string
          label: string
          location_id: string
          updated_at: string
        }
        Insert: {
          business_id: string
          cart: Json
          created_at?: string
          created_by: string
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          label: string
          location_id: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          cart?: Json
          created_at?: string
          created_by?: string
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          label?: string
          location_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suspended_sales_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suspended_sales_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          business_id: string
          created_at: string
          exempt_reason: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          rate: number
          type: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          exempt_reason?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          rate?: number
          type?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          exempt_reason?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          rate?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_rates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_domains: {
        Row: {
          business_id: string
          created_at: string
          domain: string
          id: string
          is_primary: boolean
          updated_at: string
          verified: boolean
        }
        Insert: {
          business_id: string
          created_at?: string
          domain: string
          id?: string
          is_primary?: boolean
          updated_at?: string
          verified?: boolean
        }
        Update: {
          business_id?: string
          created_at?: string
          domain?: string
          id?: string
          is_primary?: boolean
          updated_at?: string
          verified?: boolean
        }
        Relationships: []
      }
      tills: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          location_id: string | null
          name: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          location_id?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          location_id?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      units: {
        Row: {
          abbreviation: string | null
          business_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          abbreviation?: string | null
          business_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          abbreviation?: string | null
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          business_id: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          till_id: string | null
          user_id: string
        }
        Insert: {
          business_id: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          till_id?: string | null
          user_id: string
        }
        Update: {
          business_id?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          till_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      subscription_packages_safe: {
        Row: {
          created_at: string | null
          description: string | null
          id: string | null
          is_active: boolean | null
          is_public: boolean | null
          max_customers: number | null
          max_locations: number | null
          max_products: number | null
          max_suppliers: number | null
          max_users: number | null
          monthly_price: number | null
          monthly_price_kes: number | null
          name: string | null
          sort_order: number | null
          trial_days: number | null
          updated_at: string | null
          yearly_price: number | null
          yearly_price_kes: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          is_public?: boolean | null
          max_customers?: number | null
          max_locations?: number | null
          max_products?: number | null
          max_suppliers?: number | null
          max_users?: number | null
          monthly_price?: number | null
          monthly_price_kes?: number | null
          name?: string | null
          sort_order?: number | null
          trial_days?: number | null
          updated_at?: string | null
          yearly_price?: number | null
          yearly_price_kes?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          is_public?: boolean | null
          max_customers?: number | null
          max_locations?: number | null
          max_products?: number | null
          max_suppliers?: number | null
          max_users?: number | null
          monthly_price?: number | null
          monthly_price_kes?: number | null
          name?: string | null
          sort_order?: number | null
          trial_days?: number | null
          updated_at?: string | null
          yearly_price?: number | null
          yearly_price_kes?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      approve_offline_payment_request: {
        Args: { _id: string; _review_notes?: string }
        Returns: undefined
      }
      customer_has_fiscalised_sales: {
        Args: { _customer_id: string }
        Returns: boolean
      }
      decrement_batch_quantity: {
        Args: { _batch_id: string; _qty: number }
        Returns: undefined
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      digitax_get_api_key: { Args: { _business_id: string }; Returns: string }
      digitax_pick_queue_batch: {
        Args: { _limit?: number }
        Returns: {
          business_id: string
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          invoice_type: Database["public"]["Enums"]["digitax_invoice_type"]
          next_retry_at: string
          original_sale_id: string | null
          payload_json: Json
          response_json: Json | null
          retry_count: number
          sale_id: string | null
          status: Database["public"]["Enums"]["digitax_queue_status"]
          submitted_at: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "digitax_invoice_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      digitax_store_api_key: {
        Args: { _api_key: string; _business_id: string }
        Returns: string
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_business_max_products: {
        Args: { _business_id: string }
        Returns: number
      }
      get_business_plan_limit: {
        Args: { _business_id: string; _kind: string }
        Returns: number
      }
      get_offline_payment_settings: { Args: never; Returns: Json }
      get_package_features_safe: {
        Args: { _package_id: string }
        Returns: {
          feature_key: string
          feature_label: string
          package_id: string
        }[]
      }
      get_public_package_features: {
        Args: never
        Returns: {
          feature_key: string
          feature_label: string
          package_id: string
        }[]
      }
      get_public_subscription_packages: {
        Args: never
        Returns: {
          description: string
          id: string
          is_public: boolean
          max_customers: number
          max_locations: number
          max_products: number
          max_suppliers: number
          max_users: number
          monthly_price_kes: number
          name: string
          sort_order: number
          trial_days: number
          yearly_price_kes: number
        }[]
      }
      get_purchases_summary: {
        Args: {
          _business_id: string
          _from: string
          _location_id: string
          _to: string
        }
        Returns: {
          purchase_count: number
          purchase_due: number
          total_purchases: number
        }[]
      }
      get_sales_summary: {
        Args: {
          _business_id: string
          _from: string
          _location_id: string
          _to: string
        }
        Returns: {
          cogs: number
          credit_sales_count: number
          credit_sales_total: number
          sale_count: number
          total_sales: number
        }[]
      }
      get_sales_trend: {
        Args: {
          _business_id: string
          _from: string
          _location_id: string
          _to: string
        }
        Returns: {
          bucket: string
          cnt: number
          total: number
        }[]
      }
      get_subscription_package_safe: {
        Args: { _id: string }
        Returns: {
          description: string
          id: string
          is_active: boolean
          is_public: boolean
          max_customers: number
          max_locations: number
          max_products: number
          max_suppliers: number
          max_users: number
          monthly_price_kes: number
          name: string
          sort_order: number
          trial_days: number
          yearly_price_kes: number
        }[]
      }
      get_user_business_id: { Args: { _user_id: string }; Returns: string }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_in_business: {
        Args: {
          _business_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_payment_provider_enabled: {
        Args: { _provider: string }
        Returns: boolean
      }
      is_sale_fiscalised: { Args: { _sale_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      product_has_fiscalised_sales: {
        Args: { _product_id: string }
        Returns: boolean
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reject_offline_payment_request: {
        Args: { _id: string; _review_notes?: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "cashier" | "stores_manager"
      digitax_connection_status:
        | "unconfigured"
        | "connected"
        | "disconnected"
        | "error"
      digitax_environment: "sandbox" | "production"
      digitax_invoice_type:
        | "invoice"
        | "credit_note"
        | "debit_note"
        | "proforma"
      digitax_queue_status:
        | "pending"
        | "processing"
        | "submitted"
        | "accepted"
        | "failed"
        | "retry_required"
        | "validation_failed"
        | "skipped"
      fiscal_status:
        | "not_applicable"
        | "pending_submission"
        | "submitted"
        | "accepted"
        | "failed"
        | "retry_required"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "manager", "cashier", "stores_manager"],
      digitax_connection_status: [
        "unconfigured",
        "connected",
        "disconnected",
        "error",
      ],
      digitax_environment: ["sandbox", "production"],
      digitax_invoice_type: [
        "invoice",
        "credit_note",
        "debit_note",
        "proforma",
      ],
      digitax_queue_status: [
        "pending",
        "processing",
        "submitted",
        "accepted",
        "failed",
        "retry_required",
        "validation_failed",
        "skipped",
      ],
      fiscal_status: [
        "not_applicable",
        "pending_submission",
        "submitted",
        "accepted",
        "failed",
        "retry_required",
      ],
    },
  },
} as const
