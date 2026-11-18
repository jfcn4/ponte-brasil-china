import { BuyerConversation } from "@/components/public/BuyerConversation";

/**
 * Conversa privada do comprador. O segredo vem no fragmento da URL e só é
 * lido no navegador, que o envia à API em cabeçalho. Nada é renderizado no
 * servidor com dados da conversa.
 */
export default function BuyerConversationPage() {
  return <BuyerConversation />;
}
