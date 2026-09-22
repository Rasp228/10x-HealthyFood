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
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      diary_entries: {
        Row: {
          amount_text: string | null
          calorie_origin:
            | Database["public"]["Enums"]["calorie_origin_enum"]
            | null
          calories: number | null
          content: string
          created_at: string
          entry_date: string
          estimation_requested_at: string | null
          id: number
          portions: number | null
          source_recipe_id: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_text?: string | null
          calorie_origin?:
            | Database["public"]["Enums"]["calorie_origin_enum"]
            | null
          calories?: number | null
          content: string
          created_at?: string
          entry_date: string
          estimation_requested_at?: string | null
          id?: number
          portions?: number | null
          source_recipe_id?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_text?: string | null
          calorie_origin?:
            | Database["public"]["Enums"]["calorie_origin_enum"]
            | null
          calories?: number | null
          content?: string
          created_at?: string
          entry_date?: string
          estimation_requested_at?: string | null
          id?: number
          portions?: number | null
          source_recipe_id?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diary_entries_source_recipe_id_fkey"
            columns: ["source_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      logs: {
        Row: {
          action_type: Database["public"]["Enums"]["action_type_enum"]
          actual_ai_model: string
          created_at: string
          generate_response_time: number
          id: number
          is_accepted: boolean | null
          user_id: string
        }
        Insert: {
          action_type: Database["public"]["Enums"]["action_type_enum"]
          actual_ai_model: string
          created_at?: string
          generate_response_time: number
          id?: number
          is_accepted?: boolean | null
          user_id: string
        }
        Update: {
          action_type?: Database["public"]["Enums"]["action_type_enum"]
          actual_ai_model?: string
          created_at?: string
          generate_response_time?: number
          id?: number
          is_accepted?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      preferences: {
        Row: {
          category: Database["public"]["Enums"]["preference_category_enum"]
          created_at: string
          id: number
          user_id: string
          value: string
        }
        Insert: {
          category: Database["public"]["Enums"]["preference_category_enum"]
          created_at?: string
          id?: number
          user_id: string
          value: string
        }
        Update: {
          category?: Database["public"]["Enums"]["preference_category_enum"]
          created_at?: string
          id?: number
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      recipes: {
        Row: {
          additional_params: string | null
          content: string
          created_at: string
          id: number
          is_ai_generated: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          additional_params?: string | null
          content: string
          created_at?: string
          id?: number
          is_ai_generated?: boolean
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          additional_params?: string | null
          content?: string
          created_at?: string
          id?: number
          is_ai_generated?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      action_type_enum: "generate_new" | "generate_modification"
      calorie_origin_enum:
        | "recipe_nutrition"
        | "ai_from_recipe"
        | "ai_from_description"
        | "manual"
      preference_category_enum:
        | "lubiane"
        | "nielubiane"
        | "wykluczone"
        | "diety"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      action_type_enum: ["generate_new", "generate_modification"],
      calorie_origin_enum: [
        "recipe_nutrition",
        "ai_from_recipe",
        "ai_from_description",
        "manual",
      ],
      preference_category_enum: [
        "lubiane",
        "nielubiane",
        "wykluczone",
        "diety",
      ],
    },
  },
} as const
