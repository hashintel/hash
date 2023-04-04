package ai.hash.rustextra.projectView

import com.intellij.codeInsight.navigation.NavigationUtil
import com.intellij.openapi.application.invokeLater
import com.intellij.util.ui.tree.TreeUtil
import javax.swing.JTree
import javax.swing.event.TreeExpansionEvent
import javax.swing.event.TreeExpansionListener

// https://intellij-support.jetbrains.com/hc/en-us/community/posts/360004324499-How-to-hook-into-click-select-event-of-the-project-view-
// TODO: we might want to add this as a setting instead
// TODO: is there a way to have a doubleClick listener?
class ModuleNodeTreeExpansionListener: TreeExpansionListener {
    override fun treeExpanded(event: TreeExpansionEvent?) {
        if (event == null || event.source !is JTree) return

        val source = event.source;

        if (source !is JTree) return

        val node = TreeUtil.getNavigatable(source, event.path);

        if (node !is ModuleNode) return

        invokeLater {
            NavigationUtil.openFileWithPsiElement(node.value, true, true)
        }
    }

    override fun treeCollapsed(event: TreeExpansionEvent?) {
    }
}
