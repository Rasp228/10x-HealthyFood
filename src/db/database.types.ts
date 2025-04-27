export interface Database {
  public: {
    Tables: {
      logs: {
        Row: {
          action_type: Database["public"]["Enums"]["action_type_enum"];
          actual_ai_model: string;
          created_at: string;
          generate_response_time: number;
          id: number;
          is_accepted: boolean | null;
          user_id: string;
        };
        Insert: {
          action_type: Database["public"]["Enums"]["action_type_enum"];
          actual_ai_model: string;
          created_at?: string;
          generate_response_time: number;
          id?: number;
          is_accepted?: boolean | null;
          user_id: string;
        };
        Update: {
          action_type?: Database["public"]["Enums"]["action_type_enum"];
          actual_ai_model?: string;
          created_at?: string;
          generate_response_time?: number;
          id?: number;
          is_accepted?: boolean | null;
          user_id?: string;
        };
        Relationships: [];
      };
      preferences: {
        Row: {
          category: Database["public"]["Enums"]["preference_category_enum"];
          created_at: string;
          id: number;
          user_id: string;
          value: string;
        };
        Insert: {
          category: Database["public"]["Enums"]["preference_category_enum"];
          created_at?: string;
          id?: number;
          user_id: string;
          value: string;
        };
        Update: {
          category?: Database["public"]["Enums"]["preference_category_enum"];
          created_at?: string;
          id?: number;
          user_id?: string;
          value?: string;
        };
        Relationships: [];
      };
      recipes: {
        Row: {
          additional_params: string | null;
          content: string;
          created_at: string;
          id: number;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          additional_params?: string | null;
          content: string;
          created_at?: string;
          id?: number;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          additional_params?: string | null;
          content?: string;
          created_at?: string;
          id?: number;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: {
      action_type_enum: "generate_new" | "generate_modification";
      preference_category_enum: "lubiane" | "nielubiane" | "wykluczone" | "diety";
    };
    CompositeTypes: Record<never, never>;
  };
}

type DefaultSchema = Database[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      action_type_enum: ["generate_new", "generate_modification"],
      preference_category_enum: ["lubiane", "nielubiane", "wykluczone", "diety"],
    },
  },
} as const;
