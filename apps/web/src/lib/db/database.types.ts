// GENERIRANO iz Supabase sheme (m-agro-v2-dev). Ne uređivati ručno.
// Regeneriraj: pnpm --filter @m-agro/web db:types
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.5' };
  public: {
    Tables: {
      app_admins: {
        Row: { created_at: string; user_id: string };
        Insert: { created_at?: string; user_id: string };
        Update: { created_at?: string; user_id?: string };
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: string;
          actor_email: string | null;
          actor_id: string | null;
          created_at: string;
          id: number;
          payload: Json | null;
          target_id: string | null;
          target_type: string | null;
        };
        Insert: {
          action: string;
          actor_email?: string | null;
          actor_id?: string | null;
          created_at?: string;
          id?: never;
          payload?: Json | null;
          target_id?: string | null;
          target_type?: string | null;
        };
        Update: {
          action?: string;
          actor_email?: string | null;
          actor_id?: string | null;
          created_at?: string;
          id?: never;
          payload?: Json | null;
          target_id?: string | null;
          target_type?: string | null;
        };
        Relationships: [];
      };
      cestice: {
        Row: {
          arkod_id: string | null;
          created_at: string;
          geom_arkod: unknown;
          geom_hash: string | null;
          geom_precizna: unknown;
          gospodarstvo_id: string;
          id: string;
          kultura: string | null;
          land_use_id: number | null;
          local_id: string | null;
          naziv: string;
          povrsina_ha: number | null;
          updated_at: string;
        };
        Insert: {
          arkod_id?: string | null;
          created_at?: string;
          geom_arkod: unknown;
          geom_hash?: string | null;
          geom_precizna?: unknown;
          gospodarstvo_id: string;
          id?: string;
          kultura?: string | null;
          land_use_id?: number | null;
          local_id?: string | null;
          naziv: string;
          povrsina_ha?: number | null;
          updated_at?: string;
        };
        Update: {
          arkod_id?: string | null;
          created_at?: string;
          geom_arkod?: unknown;
          geom_hash?: string | null;
          geom_precizna?: unknown;
          gospodarstvo_id?: string;
          id?: string;
          kultura?: string | null;
          land_use_id?: number | null;
          local_id?: string | null;
          naziv?: string;
          povrsina_ha?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cestice_gospodarstvo_id_fkey';
            columns: ['gospodarstvo_id'];
            isOneToOne: false;
            referencedRelation: 'gospodarstva';
            referencedColumns: ['id'];
          },
        ];
      };
      gospodarstva: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          mibpg: string | null;
          naziv: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          id?: string;
          mibpg?: string | null;
          naziv: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          mibpg?: string | null;
          naziv?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          created_at: string;
          gospodarstvo_id: string;
          uloga: Database['public']['Enums']['uloga_clanstva'];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          gospodarstvo_id: string;
          uloga?: Database['public']['Enums']['uloga_clanstva'];
          user_id: string;
        };
        Update: {
          created_at?: string;
          gospodarstvo_id?: string;
          uloga?: Database['public']['Enums']['uloga_clanstva'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'memberships_gospodarstvo_id_fkey';
            columns: ['gospodarstvo_id'];
            isOneToOne: false;
            referencedRelation: 'gospodarstva';
            referencedColumns: ['id'];
          },
        ];
      };
      ndvi_cache: {
        Row: {
          cloud_pct: number | null;
          created_at: string;
          datum: string;
          geom_hash: string;
          max: number | null;
          mean: number | null;
          min: number | null;
          percentiles: Json | null;
          sample_count: number | null;
          stdev: number | null;
        };
        Insert: {
          cloud_pct?: number | null;
          created_at?: string;
          datum: string;
          geom_hash: string;
          max?: number | null;
          mean?: number | null;
          min?: number | null;
          percentiles?: Json | null;
          sample_count?: number | null;
          stdev?: number | null;
        };
        Update: {
          cloud_pct?: number | null;
          created_at?: string;
          datum?: string;
          geom_hash?: string;
          max?: number | null;
          mean?: number | null;
          min?: number | null;
          percentiles?: Json | null;
          sample_count?: number | null;
          stdev?: number | null;
        };
        Relationships: [];
      };
      operacije: {
        Row: {
          amount: number | null;
          cestica_id: string;
          created_at: string;
          created_by: string | null;
          datum: string;
          dubina: number | null;
          fert: string | null;
          hektolitarska: number | null;
          id: string;
          kultura: string | null;
          local_id: string | null;
          note: string | null;
          product: string | null;
          sorta: string | null;
          tip: Database['public']['Enums']['tip_operacije'];
          unit: string | null;
          updated_at: string;
          vlaga: number | null;
        };
        Insert: {
          amount?: number | null;
          cestica_id: string;
          created_at?: string;
          created_by?: string | null;
          datum: string;
          dubina?: number | null;
          fert?: string | null;
          hektolitarska?: number | null;
          id?: string;
          kultura?: string | null;
          local_id?: string | null;
          note?: string | null;
          product?: string | null;
          sorta?: string | null;
          tip: Database['public']['Enums']['tip_operacije'];
          unit?: string | null;
          updated_at?: string;
          vlaga?: number | null;
        };
        Update: {
          amount?: number | null;
          cestica_id?: string;
          created_at?: string;
          created_by?: string | null;
          datum?: string;
          dubina?: number | null;
          fert?: string | null;
          hektolitarska?: number | null;
          id?: string;
          kultura?: string | null;
          local_id?: string | null;
          note?: string | null;
          product?: string | null;
          sorta?: string | null;
          tip?: Database['public']['Enums']['tip_operacije'];
          unit?: string | null;
          updated_at?: string;
          vlaga?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'operacije_cestica_id_fkey';
            columns: ['cestica_id'];
            isOneToOne: false;
            referencedRelation: 'cestice';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: { created_at: string; email: string; id: string; ime_prezime: string | null; updated_at: string };
        Insert: { created_at?: string; email: string; id: string; ime_prezime?: string | null; updated_at?: string };
        Update: { created_at?: string; email?: string; id?: string; ime_prezime?: string | null; updated_at?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      uvezi_cestice: {
        Args: { p_gospodarstvo: string; p_cestice: Json; p_mod: string };
        Returns: Json;
      };
    };
    Enums: {
      tip_operacije: 'sjetva' | 'prihrana' | 'zastita' | 'zetva' | 'obrada' | 'ostalo';
      uloga_clanstva: 'citanje' | 'clan' | 'vlasnik';
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export const Constants = {
  public: {
    Enums: {
      tip_operacije: ['sjetva', 'prihrana', 'zastita', 'zetva', 'obrada', 'ostalo'],
      uloga_clanstva: ['citanje', 'clan', 'vlasnik'],
    },
  },
} as const;
