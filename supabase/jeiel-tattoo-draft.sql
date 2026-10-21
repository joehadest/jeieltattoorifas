-- Dados transcritos da arte e do contato fornecidos pelo organizador.
-- Execute DEPOIS das migrações de numeração e personalização visual.
-- O rascunho não é publicado e nenhum pagamento é habilitado por este arquivo.
begin;

update public.site_settings set
  site_name = case when site_name in ('Rifa Club','') then 'Jeiel Tattoo' else site_name end,
  pix_key = case when pix_key = '' then 'jeiellimeira36@gmail.com' else pix_key end,
  receiver_city = case when receiver_city = '' then 'Alto do Rodrigues' else receiver_city end,
  whatsapp = case when whatsapp = '' then '558499540402' else whatsapp end
where id=1;

insert into public.campaigns(
  id,title,subtitle,category,image,price,total_numbers,number_start,
  draw_date,status,description,rules
) values (
  '00000000-0000-4000-a000-000000000004',
  'Rifa Tattoo',
  'Uma tattoo de R$ 1.000 ou R$ 500 no Pix.',
  'Tattoo',
  '/images/rifa-tattoo-jeiel.jpeg',
  30,100,1,null,'paused',
  'Concorra a uma tattoo no valor de R$ 1.000,00 ou escolha R$ 500,00 no Pix. Cada número custa R$ 30,00. São 100 números, de 01 a 100. Atendimento em Alto do Rodrigues/RN. A arte informa sorteio em 29/12; ano a confirmar.',
  'RASCUNHO: confirmar com o organizador o ano do sorteio de 29/12, a forma de apuração, as condições da tattoo e os prazos de entrega. Prêmio informado na arte: tattoo de R$ 1.000,00 ou R$ 500,00 no Pix. O pagamento é confirmado manualmente após a conferência do comprovante. Reservas sem confirmação expiram em 30 minutos.'
) on conflict(id) do nothing;

commit;
