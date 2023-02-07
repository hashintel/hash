import ai.hash.rustextra.projectView.ModuleNode
import com.intellij.codeInsight.navigation.NavigationUtil
import com.intellij.openapi.application.invokeLater
import com.intellij.util.ui.tree.TreeUtil
import javax.swing.JTree
import javax.swing.event.TreeExpansionEvent
import javax.swing.event.TreeExpansionListener

class ModuleNodeTreeExpansionListener: TreeExpansionListener {
    override fun treeExpanded(event: TreeExpansionEvent?) {
        if (event != null && event.source is JTree) {
            val source = event.source;

            if (source is JTree) {
                val navi = TreeUtil.getNavigatable(source, event.path);

                if (navi is ModuleNode) {
                    invokeLater {
                        NavigationUtil.openFileWithPsiElement(navi.value, true, true)
                    }
                }
            }
        }
    }

    override fun treeCollapsed(event: TreeExpansionEvent?) {
    }
}